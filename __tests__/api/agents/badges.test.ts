import { describe, it, expect, beforeEach } from "vitest"
import { GET } from "@/app/api/agents/[id]/badges/route"
import { registerAgent, resetAgentRegistryForTests } from "@/lib/agent-registry"
import { upsertReputationMetrics, resetReputationStoreForTests } from "@/lib/reputation/reputation-store"

const minAgent = (agentId: string) => ({
  agentId,
  model: "test",
  district: "defense" as const,
  capabilities: [] as string[],
  status: "active" as const,
  endpoint: "http://test",
  x402: { accepts: false },
})

beforeEach(() => {
  resetAgentRegistryForTests()
  resetReputationStoreForTests()
})

describe("GET /api/agents/:id/badges", () => {
  it("returns 404 for unknown agent", async () => {
    const res = await GET(
      new Request("http://localhost/api/agents/ghost/badges"),
      { params: Promise.resolve({ id: "ghost" }) },
    )
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.error).toBe("agent not found")
  })

  it("returns empty badge list for agent with no badges", async () => {
    registerAgent(minAgent("bot-empty"))
    const res = await GET(
      new Request("http://localhost/api/agents/bot-empty/badges"),
      { params: Promise.resolve({ id: "bot-empty" }) },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ agentId: "bot-empty", badges: [], total: 0 })
  })

  it("returns badges sorted by earnedAt descending", async () => {
    registerAgent(minAgent("bot-sorted"))
    upsertReputationMetrics("bot-sorted", {
      badges: [
        { id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" },
        { id: "rare-taskmaster", rarity: "rare", awardedAt: "2026-06-01T00:00:00.000Z" },
      ],
    })
    const res = await GET(
      new Request("http://localhost/api/agents/bot-sorted/badges"),
      { params: Promise.resolve({ id: "bot-sorted" }) },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.total).toBe(2)
    expect(json.badges[0].badgeId).toBe("rare-taskmaster")
    expect(json.badges[0].earnedAt).toBe("2026-06-01T00:00:00.000Z")
    expect(json.badges[0].rarity).toBe("rare")
    expect(json.badges[0].xpValue).toBeGreaterThan(0)
    expect(json.badges[0].name).toBe("Rare Taskmaster")
    expect(json.badges[1].badgeId).toBe("first-quest")
  })

  it("returns catalog metadata for known badge ids", async () => {
    registerAgent(minAgent("bot-meta"))
    upsertReputationMetrics("bot-meta", {
      badges: [{ id: "zk-certified", rarity: "epic", awardedAt: "2026-06-01T00:00:00.000Z" }],
    })
    const res = await GET(
      new Request("http://localhost/api/agents/bot-meta/badges"),
      { params: Promise.resolve({ id: "bot-meta" }) },
    )
    const json = await res.json()
    expect(json.badges[0]).toMatchObject({
      badgeId: "zk-certified",
      name: "ZK Certified",
      description: "Minted first ZK passport for permanent identity.",
      rarity: "epic",
      xpValue: 100,
    })
  })

  it("returns fallback metadata for unknown badge ids", async () => {
    registerAgent(minAgent("bot-unknown-badge"))
    upsertReputationMetrics("bot-unknown-badge", {
      badges: [{ id: "mystery-award-12345", rarity: "common", awardedAt: "2026-06-01T00:00:00.000Z" }],
    })
    const res = await GET(
      new Request("http://localhost/api/agents/bot-unknown-badge/badges"),
      { params: Promise.resolve({ id: "bot-unknown-badge" }) },
    )
    const json = await res.json()
    expect(json.total).toBe(1)
    expect(json.badges[0].badgeId).toBe("mystery-award-12345")
    expect(json.badges[0].name).toBe("mystery-award-12345")
    expect(json.badges[0].xpValue).toBe(0)
  })

  it("filters badges by rarity", async () => {
    registerAgent(minAgent("bot-rarity"))
    upsertReputationMetrics("bot-rarity", {
      badges: [
        { id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" },
        { id: "rare-taskmaster", rarity: "rare", awardedAt: "2026-06-01T00:00:00.000Z" },
      ],
    })
    const res = await GET(
      new Request("http://localhost/api/agents/bot-rarity/badges?rarity=common"),
      { params: Promise.resolve({ id: "bot-rarity" }) },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.total).toBe(1)
    expect(json.badges[0].rarity).toBe("common")
  })

  it("returns 400 for invalid rarity", async () => {
    registerAgent(minAgent("bot-bad-rarity"))
    const res = await GET(
      new Request("http://localhost/api/agents/bot-bad-rarity/badges?rarity=mythic"),
      { params: Promise.resolve({ id: "bot-bad-rarity" }) },
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain("rarity")
    expect(json.error).toContain("mythic")
  })
})
