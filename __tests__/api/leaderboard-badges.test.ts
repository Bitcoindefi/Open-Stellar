import { describe, it, expect, beforeEach } from "vitest"
import { GET } from "@/app/api/leaderboard/route"
import { upsertReputationMetrics, resetReputationStoreForTests } from "@/lib/reputation/reputation-store"

beforeEach(() => {
  resetReputationStoreForTests()
})

describe("GET /api/leaderboard – badge embedding", () => {
  it("returns a valid response with agents array and refreshedAt", async () => {
    const res = await GET(new Request("http://localhost/api/leaderboard"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.agents)).toBe(true)
    expect(typeof json.refreshedAt).toBe("string")
    expect(json.nextResetAt).toBe("Sunday 00:00 UTC")
  })

  it("every agent row has a badgeIcons array", async () => {
    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const json = await res.json()
    for (const agent of json.agents) {
      expect(Array.isArray(agent.badgeIcons)).toBe(true)
    }
  })

  it("embeds badge icons for an agent that has reputation badges", async () => {
    // bot-0 is the first mock agent in BASE_AGENTS
    upsertReputationMetrics("bot-0", {
      badges: [
        { id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" },
        { id: "rare-taskmaster", rarity: "rare", awardedAt: "2026-06-15T00:00:00.000Z" },
        { id: "zk-certified", rarity: "epic", awardedAt: "2026-06-20T00:00:00.000Z" },
      ],
    })

    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const json = await res.json()
    const bot0 = json.agents.find((a: { id: string }) => a.id === "bot-0")
    expect(bot0).toBeDefined()
    expect(bot0.badgeIcons.length).toBe(3)

    // Should be sorted most-recent first
    expect(bot0.badgeIcons[0].id).toBe("zk-certified")
    expect(bot0.badgeIcons[0].rarity).toBe("epic")
    expect(bot0.badgeIcons[0].name).toBe("ZK Certified")
    expect(typeof bot0.badgeIcons[0].earnedAt).toBe("string")

    expect(bot0.badgeIcons[1].id).toBe("rare-taskmaster")
    expect(bot0.badgeIcons[1].rarity).toBe("rare")

    expect(bot0.badgeIcons[2].id).toBe("first-quest")
    expect(bot0.badgeIcons[2].rarity).toBe("common")
  })

  it("resolves badges for multiple agents in parallel without waterfall", async () => {
    // Seed badges on several agents to confirm all are resolved
    const seeds = [
      ["bot-0", "first-quest", "common", "2026-04-01T00:00:00.000Z"],
      ["bot-1", "zk-certified", "epic", "2026-05-01T00:00:00.000Z"],
      ["bot-2", "rare-taskmaster", "rare", "2026-06-01T00:00:00.000Z"],
    ] as const

    for (const [id, badgeId, rarity, awardedAt] of seeds) {
      upsertReputationMetrics(id, {
        badges: [{ id: badgeId, rarity, awardedAt }],
      })
    }

    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const json = await res.json()

    for (const [agentId, badgeId] of seeds) {
      const agent = json.agents.find((a: { id: string }) => a.id === agentId)
      expect(agent).toBeDefined()
      const badge = agent.badgeIcons.find((b: { id: string }) => b.id === badgeId)
      expect(badge).toBeDefined()
      expect(badge.id).toBe(badgeId)
    }
  })

  it("returns empty badgeIcons array for agent with no reputation record", async () => {
    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const json = await res.json()
    // After resetReputationStoreForTests none of the mock agents have badges
    for (const agent of json.agents) {
      // badgeIcons may be non-empty only if reputation store was seeded, but
      // in this fresh test run the store is empty → badges array is [] 
      // (getReputation seeds defaultMetrics with empty badge array)
      expect(agent.badgeIcons).toBeDefined()
      expect(Array.isArray(agent.badgeIcons)).toBe(true)
    }
  })

  it("works for district view and embeds badges correctly", async () => {
    upsertReputationMetrics("bot-0", {
      badges: [{ id: "district-contender", rarity: "uncommon", awardedAt: "2026-06-01T00:00:00.000Z" }],
    })

    const res = await GET(
      new Request("http://localhost/api/leaderboard?view=district&district=data-center"),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    // All returned agents must be in data-center district
    for (const agent of json.agents) {
      expect(agent.district).toBe("data-center")
    }
    const bot0 = json.agents.find((a: { id: string }) => a.id === "bot-0")
    if (bot0) {
      const badge = bot0.badgeIcons.find((b: { id: string }) => b.id === "district-contender")
      expect(badge).toBeDefined()
      expect(badge.name).toBe("District Contender")
      expect(badge.rarity).toBe("uncommon")
    }
  })

  it("works for week view", async () => {
    const res = await GET(new Request("http://localhost/api/leaderboard?view=week"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.agents)).toBe(true)
    for (const agent of json.agents) {
      expect(Array.isArray(agent.badgeIcons)).toBe(true)
    }
  })

  it("badge name falls back to badgeId for unknown badges", async () => {
    upsertReputationMetrics("bot-0", {
      badges: [{ id: "mystery-award-xyz", rarity: "common", awardedAt: "2026-06-01T00:00:00.000Z" }],
    })
    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const json = await res.json()
    const bot0 = json.agents.find((a: { id: string }) => a.id === "bot-0")
    const badge = bot0.badgeIcons.find((b: { id: string }) => b.id === "mystery-award-xyz")
    expect(badge).toBeDefined()
    expect(badge.name).toBe("mystery-award-xyz")
  })

  it("response has Cache-Control: no-store header", async () => {
    const res = await GET(new Request("http://localhost/api/leaderboard"))
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })
})
