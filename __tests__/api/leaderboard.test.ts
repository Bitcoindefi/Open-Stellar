import { beforeEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/leaderboard/route"
import { registerAgent, resetAgentRegistryForTests } from "@/lib/agent-registry"
import { awardXP, resetAgentXpDb } from "@/lib/gamification/xp"
import { upsertReputationMetrics, resetReputationStoreForTests } from "@/lib/reputation/reputation-store"

function register(agentId: string, district: "data-center" | "comm-hub" = "data-center") {
  registerAgent({
    agentId,
    model: "claude-haiku-4-5",
    district,
    capabilities: ["analytics"],
    x402: { accepts: true },
    status: "active",
    endpoint: `https://example.com/${agentId}`,
  })
}

beforeEach(() => {
  resetAgentRegistryForTests()
  resetAgentXpDb()
  resetReputationStoreForTests()
})

describe("GET /api/leaderboard", () => {
  it("returns live registry agents sorted by XP with public 30s cache", async () => {
    register("low-xp")
    register("high-xp")
    awardXP("low-xp", 100, "task.completed")
    awardXP("high-xp", 300, "task.completed")

    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const body = await res.json()

    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30")
    expect(body.agents.map((agent: { id: string }) => agent.id)).toEqual(["high-xp", "low-xp"])
    expect(body.agents[0].xp).toBe(300)
  })

  it("filters district view and sorts that district by task completions", async () => {
    register("data-slower", "data-center")
    register("comm-busy", "comm-hub")
    register("data-busy", "data-center")
    awardXP("data-slower", 500, "task.completed")
    awardXP("data-busy", 10, "task.completed")
    upsertReputationMetrics("data-slower", { tasksCompleted: 2 })
    upsertReputationMetrics("data-busy", { tasksCompleted: 20 })
    upsertReputationMetrics("comm-busy", { tasksCompleted: 100 })

    const res = await GET(new Request("http://localhost/api/leaderboard?view=district&district=data-center"))
    const body = await res.json()

    expect(body.agents.map((agent: { id: string }) => agent.id)).toEqual(["data-busy", "data-slower"])
    expect(body.agents.every((agent: { district: string }) => agent.district === "data-center")).toBe(true)
  })

  it("returns an empty state payload when no agents are registered", async () => {
    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const body = await res.json()

    expect(body.agents).toEqual([])
  })

  it("enriches agents with earned badges sorted by earnedAt descending", async () => {
    register("badged-agent")
    upsertReputationMetrics("badged-agent", {
      badges: [
        { id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" },
        { id: "rare-taskmaster", rarity: "rare", awardedAt: "2026-06-01T00:00:00.000Z" },
      ],
    })

    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const body = await res.json()
    const agent = body.agents.find((a: { id: string }) => a.id === "badged-agent")

    expect(agent).toBeDefined()
    expect(agent.badges).toHaveLength(2)
    expect(agent.badges[0].badgeId).toBe("rare-taskmaster")
    expect(agent.badges[0].earnedAt).toBe("2026-06-01T00:00:00.000Z")
    expect(agent.badges[0].name).toBe("Rare Taskmaster")
    expect(agent.badges[1].badgeId).toBe("first-quest")
  })

  it("returns empty badges array for agents with no badges", async () => {
    register("no-badges")

    const res = await GET(new Request("http://localhost/api/leaderboard"))
    const body = await res.json()
    const agent = body.agents.find((a: { id: string }) => a.id === "no-badges")

    expect(agent).toBeDefined()
    expect(agent.badges).toEqual([])
  })
})
