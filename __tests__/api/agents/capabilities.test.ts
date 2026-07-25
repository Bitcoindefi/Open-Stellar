import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, revalidate } from "@/app/api/agents/[id]/capabilities/route"
import { registerAgent, resetAgentRegistryForTests } from "@/lib/agent-registry"
import { upsertReputationMetrics } from "@/lib/reputation/reputation-store"
import * as questLeaderboard from "@/lib/gamification/quest-leaderboard"

describe("GET /api/agents/:id/capabilities", () => {
  beforeEach(() => {
    resetAgentRegistryForTests()
    vi.clearAllMocks()
    vi.spyOn(questLeaderboard, 'getAgentQuestStats').mockReturnValue({ questsCompleted: 0, xpFromQuests: 0, rank: null })
  })

  it("returns 404 for unknown agent", async () => {
    const req = new Request("http://localhost/api/agents/unknown/capabilities")
    const res = await GET(req, { params: Promise.resolve({ id: "unknown" }) })
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.ok).toBe(false)
  })

  it("returns full agent capabilities with actual registered versions", async () => {
    const agent = registerAgent({
      agentId: "bot-full",
      model: "test-model",
      district: "data-center",
      capabilities: ["translate", "summarize"],
      skillVersions: [
        { id: "translate", version: "2.1.0" },
        { id: "summarize", version: "3.0.0", minCallerVersion: ">=2.0.0" },
      ],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    upsertReputationMetrics("bot-full", {
      badges: [{ id: "badge-speed", rarity: "rare", awardedAt: "2026-06-25T08:00:00Z" }]
    })

    vi.spyOn(questLeaderboard, 'getAgentQuestStats').mockReturnValue({ questsCompleted: 8, xpFromQuests: 1250, rank: 1 })

    const req = new Request("http://localhost/api/agents/bot-full/capabilities")
    const res = await GET(req, { params: Promise.resolve({ id: "bot-full" }) })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json).toEqual({
      agentId: "bot-full",
      skills: [
        { id: "translate", version: "2.1.0" },
        { id: "summarize", version: "3.0.0" },
      ],
      districts: [{ districtId: "data-center", unlockedAt: agent.registeredAt }],
      badges: [{ id: "badge-speed", awardedAt: "2026-06-25T08:00:00Z" }],
      xp: 1250,
      questsCompleted: 8
    })
  })

  it("returns default version 1.0.0 for skills without explicit version", async () => {
    registerAgent({
      agentId: "bot-default",
      model: "test-model",
      district: "data-center",
      capabilities: ["translate"],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    const req = new Request("http://localhost/api/agents/bot-default/capabilities")
    const res = await GET(req, { params: Promise.resolve({ id: "bot-default" }) })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.skills).toEqual([{ id: "translate", version: "1.0.0" }])
  })

  it("returns empty arrays for agent with no skills/badges", async () => {
    const agent = registerAgent({
      agentId: "bot-empty",
      model: "test-model",
      district: "defense",
      capabilities: [],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    const req = new Request("http://localhost/api/agents/bot-empty/capabilities")
    const res = await GET(req, { params: Promise.resolve({ id: "bot-empty" }) })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json).toEqual({
      agentId: "bot-empty",
      skills: [],
      districts: [{ districtId: "defense", unlockedAt: agent.registeredAt }],
      badges: [],
      xp: 0,
      questsCompleted: 0
    })
  })

  it("has correct cache behaviour (revalidate=30)", () => {
    expect(revalidate).toBe(30)
  })
})