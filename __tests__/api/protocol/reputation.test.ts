import { afterEach, describe, it, expect } from "vitest"
import { GET, POST } from "@/app/api/protocol/reputation/route"
import { listUnseenNotifications, resetNotificationStore } from "@/lib/notifications/notification-store"

// The reputation store uses an in-memory Map on globalThis, so tests share state.
// Use unique actorIds per test to avoid cross-test contamination.

afterEach(() => {
  resetNotificationStore()
})

describe("GET /api/protocol/reputation", () => {
  it("returns a new actor with default score 500", async () => {
    const req = new Request("http://localhost/api/protocol/reputation?actorId=rep-test-new-actor")
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.reputation.actorId).toBe("rep-test-new-actor")
    expect(data.reputation.score).toBe(500)
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
    expect(data.reputation.score).toBe(600) // 500 default + 100
  })

  it("decreases score with negative delta", async () => {
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
    expect(data.reputation.score).toBe(300) // 500 default - 200
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

  it("clamps score to 1000 maximum", async () => {
    const actorId = "rep-test-ceiling"
    const req = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId, delta: 9999, reason: "perfect" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(data.reputation.score).toBe(1000)
  })

  it("accepts governance scope", async () => {
    const actorId = "rep-test-governance"
    const req = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId, delta: 10, reason: "voted", scope: "governance" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.reputation.score).toBe(510)
  })

  it("generates a reputation update notification", async () => {
    const actorId = "rep-test-notification"
    const req = new Request("http://localhost/api/protocol/reputation", {
      method: "POST",
      body: JSON.stringify({ actorId, delta: 25, reason: "good-service", scope: "service" }),
      headers: { "Content-Type": "application/json" },
    })

    await POST(req)

    expect(listUnseenNotifications(actorId)).toMatchObject([
      {
        agentId: actorId,
        type: "reputation_updated",
        resourceHref: `/leaderboard/${actorId}`,
      },
    ])
  })
})
