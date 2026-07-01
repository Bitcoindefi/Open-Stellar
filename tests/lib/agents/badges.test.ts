import { beforeEach, describe, expect, it } from "vitest"

import { checkAndAwardBadges, getAgentBadges, resetBadgeStoreForTests } from "@/lib/agents/badges"
import { registerAgent, resetAgentRegistryForTests, getRegisteredAgent } from "@/lib/agent-registry"
import { awardXP, resetAgentXpDb } from "@/lib/gamification/xp"
import { markQuestClaimed, resetQuestCompletions } from "@/lib/gamification/quest-completions"
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
  resetQuestCompletions()
  resetReputationStoreForTests()
})

describe("checkAndAwardBadges", () => {
  it("awards first_task only once", () => {
    registerAgent(makeAgent("agent-first-task"))
    upsertReputationMetrics("agent-first-task", { tasksCompleted: 1 })
    awardXP("agent-first-task", 10, "task.completed")

    expect(checkAndAwardBadges("agent-first-task")).toHaveLength(1)
    expect(checkAndAwardBadges("agent-first-task")).toHaveLength(0)
    expect(getAgentBadges("agent-first-task")).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "first_task" })]),
    )
  })

  it("awards quest_master after five quests", () => {
    registerAgent(makeAgent("agent-quest-master"))
    for (let i = 0; i < 5; i += 1) {
      markQuestClaimed(`quest-${i}`, "agent-quest-master")
    }

    const awarded = checkAndAwardBadges("agent-quest-master")
    expect(awarded).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "quest_master" })]),
    )
  })

  it("awards level_10 when the XP threshold is crossed", () => {
    registerAgent(makeAgent("agent-leveler"))
    awardXP("agent-leveler", 4_000, "task.completed")

    const awarded = checkAndAwardBadges("agent-leveler")
    expect(awarded).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "level_10" })]),
    )
  })

  it("awards veteran after 30 days since registration", () => {
    registerAgent(makeAgent("agent-veteran"))
    const agent = getRegisteredAgent("agent-veteran")
    agent!.registeredAt = "2026-01-01T00:00:00.000Z"

    const awarded = checkAndAwardBadges("agent-veteran", new Date("2026-02-15T00:00:00.000Z"))
    expect(awarded).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "veteran" })]),
    )
  })

  it("awards top_earner to agents in the top 10 percent by XP", () => {
    for (let i = 0; i < 10; i += 1) {
      const agentId = `agent-top-${i}`
      registerAgent(makeAgent(agentId))
      awardXP(agentId, i === 9 ? 1_000 : 10 * i, "task.completed")
    }

    const awarded = checkAndAwardBadges("agent-top-9")
    expect(awarded).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "top_earner" })]),
    )

    expect(checkAndAwardBadges("agent-top-0")).toEqual([])
  })
})
