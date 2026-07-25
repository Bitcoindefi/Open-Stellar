import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  getLeaderboard,
  getLeaderboardByAgentId,
  recordXpEvent,
  resetXpLeaderboardStore,
  seedXpEvents,
  LEADERBOARD_CACHE_TTL_MS,
  subscribeToXpEvents,
  type LeaderboardWindow,
} from "@/lib/agents/xp-leaderboard-store"
import { publishSystemEvent } from "@/lib/events/system-events"

describe("xp-leaderboard-store", () => {
  beforeEach(() => {
    resetXpLeaderboardStore()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── basic ranking ─────────────────────────────────────────────────
  it("returns agents sorted by XP descending", () => {
    seedXpEvents([
      { agentId: "agent-a", xpDelta: 100 },
      { agentId: "agent-b", xpDelta: 300 },
      { agentId: "agent-c", xpDelta: 200 },
    ])

    const board = getLeaderboard("all", 25)
    expect(board.entries).toHaveLength(3)
    expect(board.entries[0]).toEqual({
      rank: 1,
      agentId: "agent-b",
      xp: 300,
      since: expect.any(String),
    })
    expect(board.entries[1]).toEqual({
      rank: 2,
      agentId: "agent-c",
      xp: 200,
      since: expect.any(String),
    })
    expect(board.entries[2]).toEqual({
      rank: 3,
      agentId: "agent-a",
      xp: 100,
      since: expect.any(String),
    })
  })

  it("returns correct total count", () => {
    seedXpEvents([
      { agentId: "agent-a", xpDelta: 50 },
      { agentId: "agent-b", xpDelta: 75 },
    ])

    const board = getLeaderboard("all", 25)
    expect(board.total).toBe(2)
    expect(board.window).toBe("all")
    expect(board.generatedAt).toBeDefined()
  })

  // ─── 3 agents with different XP → correct ranking order ──────────────
  it("3 agents with different XP → correct ranking order", () => {
    const now = Date.now()
    seedXpEvents([
      { agentId: "agent-low", xpDelta: 50, timestampMs: now },
      { agentId: "agent-mid", xpDelta: 150, timestampMs: now },
      { agentId: "agent-high", xpDelta: 400, timestampMs: now },
    ])

    const board = getLeaderboard("all", 25)
    expect(board.entries.map((e) => e.agentId)).toEqual(["agent-high", "agent-mid", "agent-low"])
    expect(board.entries.map((e) => e.xp)).toEqual([400, 150, 50])
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2, 3])
  })

  // ─── window=7d returns only XP earned in last 7 days ───────────────
  it("window=7d returns only XP earned in last 7 days", () => {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    seedXpEvents([
      { agentId: "agent-1", xpDelta: 100, timestampMs: now - 3 * dayMs },   // within 7d
      { agentId: "agent-1", xpDelta: 50, timestampMs: now - 10 * dayMs },  // outside 7d
      { agentId: "agent-2", xpDelta: 200, timestampMs: now - 5 * dayMs },  // within 7d
    ])

    const board = getLeaderboard("7d", 25, now)
    expect(board.entries).toHaveLength(2)
    expect(board.entries.find((e) => e.agentId === "agent-1")!.xp).toBe(100)
    expect(board.entries.find((e) => e.agentId === "agent-2")!.xp).toBe(200)
  })

  // ─── window=30d returns only XP earned in last 30 days ───────────────
  it("window=30d returns only XP earned in last 30 days", () => {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    seedXpEvents([
      { agentId: "agent-1", xpDelta: 100, timestampMs: now - 15 * dayMs },  // within 30d
      { agentId: "agent-1", xpDelta: 50, timestampMs: now - 45 * dayMs },  // outside 30d
      { agentId: "agent-2", xpDelta: 200, timestampMs: now - 25 * dayMs },  // within 30d
    ])

    const board = getLeaderboard("30d", 25, now)
    expect(board.entries).toHaveLength(2)
    expect(board.entries.find((e) => e.agentId === "agent-1")!.xp).toBe(100)
    expect(board.entries.find((e) => e.agentId === "agent-2")!.xp).toBe(200)
  })

  // ─── limit=5 returns top 5 ─────────────────────────────────────────
  it("limit=5 returns top 5", () => {
    const now = Date.now()
    const events = Array.from({ length: 10 }, (_, i) => ({
      agentId: `agent-${i}`,
      xpDelta: (i + 1) * 10,
      timestampMs: now,
    }))
    seedXpEvents(events)

    const board = getLeaderboard("all", 5)
    expect(board.entries).toHaveLength(5)
    expect(board.entries[0].agentId).toBe("agent-9")
    expect(board.entries[4].agentId).toBe("agent-5")
    expect(board.total).toBe(10)
  })

  // ─── agents with 0 XP in window are excluded ───────────────────────
  it("excludes agents with 0 XP in the window", () => {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    seedXpEvents([
      { agentId: "agent-active", xpDelta: 100, timestampMs: now - 2 * dayMs },
      { agentId: "agent-old", xpDelta: 50, timestampMs: now - 10 * dayMs },
    ])

    const board = getLeaderboard("7d", 25, now)
    expect(board.entries).toHaveLength(1)
    expect(board.entries[0].agentId).toBe("agent-active")
    expect(board.total).toBe(1)
  })

  // ─── default limit is 25 ───────────────────────────────────────────
  it("uses default limit of 25", () => {
    const now = Date.now()
    const events = Array.from({ length: 30 }, (_, i) => ({
      agentId: `agent-${i}`,
      xpDelta: (i + 1) * 10,
      timestampMs: now,
    }))
    seedXpEvents(events)

    const board = getLeaderboard()
    expect(board.entries).toHaveLength(25)
    expect(board.total).toBe(30)
  })

  // ─── max limit is 100 ──────────────────────────────────────────────
  it("caps limit at 100", () => {
    const now = Date.now()
    const events = Array.from({ length: 120 }, (_, i) => ({
      agentId: `agent-${i}`,
      xpDelta: (i + 1) * 10,
      timestampMs: now,
    }))
    seedXpEvents(events)

    const board = getLeaderboard("all", 200)
    expect(board.entries).toHaveLength(100)
  })

  // ─── cumulative XP per agent ───────────────────────────────────────
  it("sums multiple XP events per agent", () => {
    seedXpEvents([
      { agentId: "agent-1", xpDelta: 50 },
      { agentId: "agent-1", xpDelta: 30 },
      { agentId: "agent-1", xpDelta: 20 },
    ])

    const board = getLeaderboard("all", 25)
    expect(board.entries).toHaveLength(1)
    expect(board.entries[0].xp).toBe(100)
  })

  // ─── caching ───────────────────────────────────────────────────────
  it("caches results for 5 minutes", () => {
    const now = Date.now()
    seedXpEvents([{ agentId: "agent-1", xpDelta: 100, timestampMs: now }])

    const first = getLeaderboard("all", 25, now)
    expect(first.entries).toHaveLength(1)

    // Advance time but stay within cache TTL
    vi.advanceTimersByTime(LEADERBOARD_CACHE_TTL_MS - 1)
    const second = getLeaderboard("all", 25, now + LEADERBOARD_CACHE_TTL_MS - 1)
    expect(second.entries).toHaveLength(1)
    expect(second.generatedAt).toBe(first.generatedAt) // same cached result
  })

  it("invalidates cache when new XP event is recorded", () => {
    const now = Date.now()
    seedXpEvents([{ agentId: "agent-1", xpDelta: 100, timestampMs: now }])

    const first = getLeaderboard("all", 25, now)
    expect(first.entries[0].xp).toBe(100)

    // New event should invalidate cache
    recordXpEvent("agent-1", 50, now + 1000)
    const second = getLeaderboard("all", 25, now + 1000)
    expect(second.entries[0].xp).toBe(150)
  })

  // ─── getLeaderboardByAgentId ───────────────────────────────────────
  it("finds agent rank by ID", () => {
    seedXpEvents([
      { agentId: "agent-a", xpDelta: 300 },
      { agentId: "agent-b", xpDelta: 100 },
    ])

    const entry = getLeaderboardByAgentId("agent-b")
    expect(entry).not.toBeNull()
    expect(entry!.rank).toBe(2)
    expect(entry!.xp).toBe(100)
  })

  it("returns null for agent not on leaderboard", () => {
    seedXpEvents([{ agentId: "agent-a", xpDelta: 100 }])
    const entry = getLeaderboardByAgentId("agent-missing")
    expect(entry).toBeNull()
  })

  // ─── system event integration ──────────────────────────────────────
  it("subscribes to agent.xp system events", () => {
    const unsubscribe = subscribeToXpEvents()

    publishSystemEvent({
      type: "agent.xp",
      agentId: "agent-sys",
      xp: 250,
      level: 1,
      occurredAt: new Date().toISOString(),
    })

    const board = getLeaderboard("all", 25)
    expect(board.entries).toHaveLength(1)
    expect(board.entries[0].agentId).toBe("agent-sys")
    expect(board.entries[0].xp).toBe(250)

    unsubscribe()
  })

  // ─── edge cases ────────────────────────────────────────────────────
  it("handles empty leaderboard", () => {
    const board = getLeaderboard()
    expect(board.entries).toHaveLength(0)
    expect(board.total).toBe(0)
  })

  it("ignores negative XP deltas", () => {
    seedXpEvents([
      { agentId: "agent-1", xpDelta: 100 },
      { agentId: "agent-1", xpDelta: -50 },
    ])

    const board = getLeaderboard()
    expect(board.entries[0].xp).toBe(100) // negative ignored, only 100 counted
  })

  it("trims and normalizes agentId", () => {
    recordXpEvent("  agent-1  ", 50)
    const board = getLeaderboard()
    expect(board.entries[0].agentId).toBe("agent-1")
  })

  it("throws on empty agentId", () => {
    expect(() => recordXpEvent("", 50)).toThrow("agentId must not be empty")
  })
})