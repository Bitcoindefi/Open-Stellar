import { beforeEach, describe, expect, it } from "vitest"

import { GET } from "@/app/api/agents/[id]/badges/route"
import { awardXP, resetAgentXpDb } from "@/lib/gamification/xp"
import { registerAgent, resetAgentRegistryForTests, getRegisteredAgent } from "@/lib/agent-registry"
import { upsertReputationMetrics, resetReputationStoreForTests } from "@/lib/reputation/reputation-store"
import { markQuestClaimed, resetQuestCompletions } from "@/lib/gamification/quest-completions"
import { resetBadgeStoreForTests } from "@/lib/agents/badges"

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
  resetQuestCompletions()
  resetAgentXpDb()
  resetBadgeStoreForTests()
})

describe("GET /api/agents/:id/badges", () => {
  it("returns 404 for unknown agent", async () => {
    const res = await GET(new Request("http://localhost/api/agents/ghost/badges"), {
      params: Promise.resolve({ id: "ghost" }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, error: "agent not found" })
  })

  it("returns the new badge API shape", async () => {
    registerAgent(minAgent("bot-empty"))

    const res = await GET(new Request("http://localhost/api/agents/bot-empty/badges"), {
      params: Promise.resolve({ id: "bot-empty" }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ badges: [], count: 0 })
  })

  it("awards and returns badges automatically when conditions are met", async () => {
    registerAgent(minAgent("bot-leveler"))
    upsertReputationMetrics("bot-leveler", { tasksCompleted: 1 })
    awardXP("bot-leveler", 4_000, "task.completed")

    const res = await GET(new Request("http://localhost/api/agents/bot-leveler/badges"), {
      params: Promise.resolve({ id: "bot-leveler" }),
    })
    const json = await res.json()

    expect(json.count).toBeGreaterThanOrEqual(2)
    expect(json.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "first_task", name: "First Task" }),
        expect.objectContaining({ type: "level_10", name: "Level 10" }),
      ]),
    )
  })

  it("awards veteran on read once the registration date is old enough", async () => {
    registerAgent(minAgent("bot-veteran"))
    const agent = getRegisteredAgent("bot-veteran")
    agent!.registeredAt = "2026-01-01T00:00:00.000Z"

    const res = await GET(new Request("http://localhost/api/agents/bot-veteran/badges"), {
      params: Promise.resolve({ id: "bot-veteran" }),
    })
    const json = await res.json()

    expect(json.badges).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "veteran" })]),
    )
  })

  it("awards quest master after five quest completions", async () => {
    registerAgent(minAgent("bot-quester"))
    for (let i = 0; i < 5; i += 1) {
      markQuestClaimed(`quest-${i}`, "bot-quester")
    }

    const res = await GET(new Request("http://localhost/api/agents/bot-quester/badges"), {
      params: Promise.resolve({ id: "bot-quester" }),
    })
    const json = await res.json()

    expect(json.badges).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "quest_master" })]),
    )
  })
})
