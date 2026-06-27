import { describe, it, expect, beforeEach } from "vitest"
import { GET } from "@/app/api/agents/[id]/xp/history/route"
import {
  resetXpDecayStore,
  recordXpEarnedEvent,
  recordXpDecayEvent,
} from "@/lib/agents/xp-decay"

describe("GET /api/agents/:id/xp/history", () => {
  beforeEach(() => {
    resetXpDecayStore()
  })

  it("returns empty events for unknown agent", async () => {
    const req = new Request("http://localhost/api/agents/unknown/xp/history")
    const res = await GET(req, { params: Promise.resolve({ id: "unknown" }) })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.agentId).toBe("unknown")
    expect(json.events).toEqual([])
  })

  it("returns chronological list of XP events", async () => {
    recordXpEarnedEvent("agent-1", 100, "task_completed", "2026-06-01T10:00:00Z")
    recordXpEarnedEvent("agent-1", 50, "quest_completed", "2026-06-05T12:00:00Z")
    recordXpDecayEvent("agent-1", -30, "xp_decayed", "2026-06-15T00:00:00Z")

    const req = new Request("http://localhost/api/agents/agent-1/xp/history")
    const res = await GET(req, { params: Promise.resolve({ id: "agent-1" }) })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.agentId).toBe("agent-1")
    expect(json.events).toHaveLength(3)

    expect(json.events[0]).toEqual({
      type: "earned",
      delta: 100,
      reason: "task_completed",
      timestamp: "2026-06-01T10:00:00Z",
    })

    expect(json.events[1]).toEqual({
      type: "earned",
      delta: 50,
      reason: "quest_completed",
      timestamp: "2026-06-05T12:00:00Z",
    })

    expect(json.events[2]).toEqual({
      type: "decayed",
      delta: -30,
      reason: "xp_decayed",
      timestamp: "2026-06-15T00:00:00Z",
    })
  })

  it("returns events in insertion order", async () => {
    recordXpEarnedEvent("agent-2", 200, "task_completed", "2026-06-01T10:00:00Z")
    recordXpDecayEvent("agent-2", -20, "xp_decayed", "2026-06-10T00:00:00Z")

    const req = new Request("http://localhost/api/agents/agent-2/xp/history")
    const res = await GET(req, { params: Promise.resolve({ id: "agent-2" }) })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.events).toHaveLength(2)
    expect(json.events[0].timestamp).toBe("2026-06-01T10:00:00Z")
    expect(json.events[1].timestamp).toBe("2026-06-10T00:00:00Z")
  })

  it("isolates history between agents", async () => {
    recordXpEarnedEvent("agent-a", 100, "task_completed", "2026-06-01T10:00:00Z")
    recordXpEarnedEvent("agent-b", 200, "quest_completed", "2026-06-02T10:00:00Z")

    const reqA = new Request("http://localhost/api/agents/agent-a/xp/history")
    const resA = await GET(reqA, { params: Promise.resolve({ id: "agent-a" }) })
    const jsonA = await resA.json()
    expect(jsonA.events).toHaveLength(1)
    expect(jsonA.events[0].delta).toBe(100)

    const reqB = new Request("http://localhost/api/agents/agent-b/xp/history")
    const resB = await GET(reqB, { params: Promise.resolve({ id: "agent-b" }) })
    const jsonB = await resB.json()
    expect(jsonB.events).toHaveLength(1)
    expect(jsonB.events[0].delta).toBe(200)
  })
})