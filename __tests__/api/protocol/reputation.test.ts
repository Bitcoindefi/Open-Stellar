import { describe, it, expect } from "vitest"
import { GET, POST } from "@/app/api/protocol/reputation/route"

// The reputation store uses an in-memory Map on globalThis, so tests share state.
// Use unique actorIds per test to avoid cross-test contamination.

describe("GET /api/protocol/reputation", () => {
  it("returns a new actor with default score 0 (score is earned from metrics)", async () => {
    const req = new Request("http://localhost/api/protocol/reputation?actorId=rep-test-new-actor")
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.reputation.actorId).toBe("rep-test-new-actor")
    expect(data.reputation.score).toBe(0)
  })

  it("returns all reputations when no actorId given", async () => {
    // Seed an actor first
    const seed = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId: "rep-test-list-actor", delta: 0, reason: "seed" }),
      headers: { "Content-Type": "application/json" },
    })
    await POST(seed)

    const req = new Request("http://localhost/api/protocol/reputation")
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.reputations)).toBe(true)
    expect(data.reputations.length).toBeGreaterThan(0)
  })
})

describe("POST /api/protocol/reputation", () => {
  it("increases score with positive delta", async () => {
    const actorId = "rep-test-positive-delta"
    const req = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId, delta: 100, reason: "good-service", scope: "tx" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    // positive non-task/non-x402 delta awards a common badge (5 pts)
    expect(data.reputation.score).toBe(5)
  })

  it("decreases score with negative delta (adds infractions, each worth -10 pts)", async () => {
    const actorId = "rep-test-negative-delta"
    const req = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId, delta: -200, reason: "bad-service", scope: "tx" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    // -200 → infractions += 20 → penalty = 200 pts → no positive pts → score clamped to 0
    expect(data.reputation.score).toBe(0)
  })

  it("clamps score to 0 minimum", async () => {
    const actorId = "rep-test-floor"
    const req = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId, delta: -9999, reason: "banned" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(data.reputation.score).toBe(0)
  })

  it("task reason caps score contribution at 500 regardless of delta", async () => {
    const actorId = "rep-test-task-ceiling"
    const req = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId, delta: 9999, reason: "task-completed" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    // delta=9999 with 'task' reason → tasksCompleted=9999 → taskPoints=min(500,9999)=500
    expect(data.reputation.score).toBe(500)
  })

  it("accepts governance scope (scope field recorded but score computed from metrics)", async () => {
    const actorId = "rep-test-governance"
    const req = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId, delta: 10, reason: "voted", scope: "governance" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(data.ok).toBe(true)
    // positive non-task/non-x402 delta → 1 common badge → score = 5
    expect(data.reputation.score).toBe(5)
  })
})
