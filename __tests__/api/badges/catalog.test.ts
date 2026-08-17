import { beforeEach, describe, expect, it } from "vitest"

import { GET } from "@/app/api/badges/route"
import { awardXP, resetAgentXpDb } from "@/lib/gamification/xp"
import { checkAndAwardBadges, resetBadgeStoreForTests } from "@/lib/agents/badges"
import { registerAgent, resetAgentRegistryForTests } from "@/lib/agent-registry"
import { resetReputationStoreForTests, upsertReputationMetrics } from "@/lib/reputation/reputation-store"

const makeAgent = (agentId: string) => ({
  agentId,
  model: "test",
  district: "defense" as const,
  capabilities: [],
  status: "active" as const,
  endpoint: "http://example.test",
  x402: { accepts: false },
})

beforeEach(() => {
  resetAgentRegistryForTests()
  resetBadgeStoreForTests()
  resetAgentXpDb()
  resetReputationStoreForTests()
})

describe("GET /api/badges", () => {
  it("returns the five implemented badge types", async () => {
    const res = await GET()
    const json = await res.json()

    expect(json).toHaveLength(5)
    expect(json.map((badge: { type: string }) => badge.type).sort()).toEqual([
      "first_task",
      "level_10",
      "quest_master",
      "top_earner",
      "veteran",
    ])
  })

  it("includes earnedByCount from the file-backed badge store", async () => {
    registerAgent(makeAgent("agent-counted"))
    upsertReputationMetrics("agent-counted", { tasksCompleted: 1 })
    awardXP("agent-counted", 4_000, "task.completed")
    checkAndAwardBadges("agent-counted")

    const res = await GET()
    const json = await res.json()

    const firstTask = json.find((badge: { type: string }) => badge.type === "first_task")
    const levelTen = json.find((badge: { type: string }) => badge.type === "level_10")
    expect(firstTask.earnedByCount).toBe(1)
    expect(levelTen.earnedByCount).toBe(1)
  })
})
