import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { POST } from "@/app/api/cron/xp-decay/route"
import {
  resetXpDecayStore,
  applyXpDecayToAgent,
  computeDecayAmount,
  getXpDecayAudit,
  recordXpEarnedEvent,
  runXpDecayCron,
} from "@/lib/agents/xp-decay"
import { awardXP, resetAgentXpDb } from "@/lib/gamification/xp"

describe("POST /api/cron/xp-decay", () => {
  beforeEach(() => {
    resetXpDecayStore()
    resetAgentXpDb()
  })

  afterEach(() => {
    resetXpDecayStore()
    resetAgentXpDb()
    delete process.env.CRON_SECRET
  })

  it("returns 401 when CRON_SECRET is set and no auth header", async () => {
    process.env.CRON_SECRET = "test-secret"

    const req = new Request("http://localhost/api/cron/xp-decay", { method: "POST" })
    const res = await POST(req)
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe("Unauthorized cron request")
  })

  it("returns 200 with correct Bearer token", async () => {
    process.env.CRON_SECRET = "test-secret"

    awardXP("agent-old", 1000, "task.completed")
    recordXpEarnedEvent("agent-old", 1000, "task.completed", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    const req = new Request("http://localhost/api/cron/xp-decay", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.processed).toBe(1)
    expect(body.decayed).toBe(1)
    expect(body.skipped).toBe(0)
  })

  it("returns 200 with no auth when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET

    const req = new Request("http://localhost/api/cron/xp-decay", { method: "POST" })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it("skips agents within grace period", async () => {
    delete process.env.CRON_SECRET

    awardXP("agent-recent", 500, "task.completed")
    recordXpEarnedEvent("agent-recent", 500, "task.completed", new Date().toISOString())

    const req = new Request("http://localhost/api/cron/xp-decay", { method: "POST" })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.processed).toBe(1)
    expect(body.decayed).toBe(0)
    expect(body.skipped).toBe(1)
  })

  it("applies correct decay math", async () => {
    delete process.env.CRON_SECRET

    const now = new Date("2026-07-27T00:00:00Z")
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    awardXP("agent-math", 1000, "task.completed")
    recordXpEarnedEvent("agent-math", 1000, "task.completed", thirtyDaysAgo.toISOString())

    const result = applyXpDecayToAgent("agent-math", now)

    expect(result.decayed).toBe(true)
    expect(result.before).toBe(1000)
    expect(result.after).toBe(500)
    expect(result.decayAmount).toBe(500)
    expect(result.daysSinceLastEvent).toBe(30)
  })

  it("floors XP at 0", async () => {
    delete process.env.CRON_SECRET

    const now = new Date("2026-07-27T00:00:00Z")
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    awardXP("agent-floor", 10, "task.completed")
    recordXpEarnedEvent("agent-floor", 10, "task.completed", ninetyDaysAgo.toISOString())

    const result = applyXpDecayToAgent("agent-floor", now)

    expect(result.decayed).toBe(true)
    expect(result.before).toBe(10)
    // 10 XP * 0.5^(90/30) = 10 * 0.125 = 1.25 → rounds to 1
    expect(result.after).toBe(1)
    expect(result.after).toBeGreaterThanOrEqual(0)
  })

  it("writes audit entry for every decay event", async () => {
    delete process.env.CRON_SECRET

    const now = new Date("2026-07-27T00:00:00Z")
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    awardXP("agent-audit", 800, "task.completed")
    recordXpEarnedEvent("agent-audit", 800, "task.completed", thirtyDaysAgo.toISOString())

    applyXpDecayToAgent("agent-audit", now)

    const audit = getXpDecayAudit()
    expect(audit).toHaveLength(1)
    expect(audit[0].action).toBe("xp_decayed")
    expect(audit[0].agentId).toBe("agent-audit")
    expect(audit[0].before).toBe(800)
    expect(audit[0].after).toBe(400)
    expect(audit[0].daysSinceLastEvent).toBe(30)
    expect(audit[0].timestamp).toBeDefined()
  })

  it("handles multiple agents in one cron run", async () => {
    delete process.env.CRON_SECRET

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    awardXP("agent-a", 1000, "task.completed")
    recordXpEarnedEvent("agent-a", 1000, "task.completed", thirtyDaysAgo.toISOString())

    awardXP("agent-b", 2000, "task.completed")
    recordXpEarnedEvent("agent-b", 2000, "task.completed", thirtyDaysAgo.toISOString())

    awardXP("agent-c", 500, "task.completed")
    recordXpEarnedEvent("agent-c", 500, "task.completed", new Date().toISOString())

    const result = runXpDecayCron()

    expect(result.processed).toBe(3)
    expect(result.decayed).toBe(2)
    expect(result.skipped).toBe(1)
  })
})

describe("computeDecayAmount", () => {
  it("returns 0 for current XP at minimum", () => {
    expect(computeDecayAmount(0, 30)).toBe(0)
    expect(computeDecayAmount(0, 100)).toBe(0)
  })

  it("returns 0 when daysSinceLastEvent is 0 or negative", () => {
    expect(computeDecayAmount(1000, 0)).toBe(0)
    expect(computeDecayAmount(1000, -5)).toBe(0)
  })

  it("halves XP after one half-life", () => {
    expect(computeDecayAmount(1000, 30)).toBe(500)
  })

  it("quarters XP after two half-lives", () => {
    expect(computeDecayAmount(1000, 60)).toBe(750)
  })

  it("floors at minimumXp", () => {
    expect(computeDecayAmount(10, 90, 30, 0)).toBe(9)
  })
})
