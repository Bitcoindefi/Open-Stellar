import { beforeEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/agents/[id]/xp/history/route"
import {
  getAgentXpHistory,
  recordXpDecayEvent,
  recordXpEarnedEvent,
  resetXpDecayStore,
} from "@/lib/agents/xp-decay"

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("GET /api/agents/[id]/xp/history", () => {
  beforeEach(() => {
    resetXpDecayStore()
  })

  it("returns paginated events newest-first", async () => {
    recordXpEarnedEvent("bot-1", 10, "task_completed", "2026-06-01T10:00:00.000Z")
    recordXpEarnedEvent("bot-1", 50, "quest_completed", "2026-06-02T10:00:00.000Z")
    recordXpDecayEvent("bot-1", -25, "xp_decayed", "2026-06-03T10:00:00.000Z")

    const res = await GET(
      new Request("http://localhost/api/agents/bot-1/xp/history?page=1&pageSize=2"),
      context("bot-1"),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({
      agentId: "bot-1",
      totalXp: 35,
      page: 1,
      pageSize: 2,
      total: 3,
    })
    expect(data.events).toEqual([
      {
        type: "decayed",
        delta: -25,
        reason: "xp_decayed",
        timestamp: "2026-06-03T10:00:00.000Z",
      },
      {
        type: "earned",
        delta: 50,
        reason: "quest_completed",
        timestamp: "2026-06-02T10:00:00.000Z",
      },
    ])
  })

  it("filters by type", async () => {
    recordXpEarnedEvent("bot-1", 100, "quest_completed", "2026-06-01T10:00:00.000Z")
    recordXpDecayEvent("bot-1", -20, "xp_decayed", "2026-06-02T10:00:00.000Z")

    const res = await GET(
      new Request("http://localhost/api/agents/bot-1/xp/history?type=earned"),
      context("bot-1"),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totalXp).toBe(80)
    expect(data.total).toBe(1)
    expect(data.events).toEqual([
      {
        type: "earned",
        delta: 100,
        reason: "quest_completed",
        timestamp: "2026-06-01T10:00:00.000Z",
      },
    ])
  })

  it("filters by date range using YYYY-MM-DD params", async () => {
    recordXpEarnedEvent("bot-1", 10, "task_completed", "2025-12-31T23:59:59.999Z")
    recordXpEarnedEvent("bot-1", 100, "quest_completed", "2026-01-01T12:00:00.000Z")
    recordXpDecayEvent("bot-1", -50, "xp_decayed", "2026-06-30T08:30:00.000Z")
    recordXpEarnedEvent("bot-1", 25, "payment_received", "2026-07-01T00:00:00.000Z")

    const res = await GET(
      new Request("http://localhost/api/agents/bot-1/xp/history?from=2026-01-01&to=2026-06-30&pageSize=20"),
      context("bot-1"),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totalXp).toBe(85)
    expect(data.total).toBe(2)
    expect(data.events).toEqual([
      {
        type: "decayed",
        delta: -50,
        reason: "xp_decayed",
        timestamp: "2026-06-30T08:30:00.000Z",
      },
      {
        type: "earned",
        delta: 100,
        reason: "quest_completed",
        timestamp: "2026-01-01T12:00:00.000Z",
      },
    ])
  })

  it("returns 400 when pageSize exceeds 100", async () => {
    const res = await GET(
      new Request("http://localhost/api/agents/bot-1/xp/history?pageSize=101"),
      context("bot-1"),
    )
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
  })

  it("returns empty history cleanly", async () => {
    const res = await GET(
      new Request("http://localhost/api/agents/bot-1/xp/history"),
      context("bot-1"),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({
      agentId: "bot-1",
      totalXp: 0,
      events: [],
      page: 1,
      pageSize: 20,
      total: 0,
    })
  })

  it("preserves raw history order in the underlying store", () => {
    recordXpEarnedEvent("bot-1", 10, "task_completed", "2026-06-01T10:00:00.000Z")
    recordXpDecayEvent("bot-1", -5, "xp_decayed", "2026-06-03T10:00:00.000Z")

    expect(getAgentXpHistory("bot-1")).toEqual([
      {
        type: "earned",
        delta: 10,
        reason: "task_completed",
        timestamp: "2026-06-01T10:00:00.000Z",
      },
      {
        type: "decayed",
        delta: -5,
        reason: "xp_decayed",
        timestamp: "2026-06-03T10:00:00.000Z",
      },
    ])
  })
})
