import { describe, expect, it } from "vitest"
import type { MoltbotAgent } from "@/lib/types"
import { awardTaskXpToAgent, getEarnedBadges, getLeaderboardRows } from "./progression"

function makeAgent(overrides: Partial<MoltbotAgent> = {}): MoltbotAgent {
  return {
    id: "bot-test",
    name: "Test Bot",
    model: "gpt-5-mini",
    status: "active",
    district: "research",
    cpu: 10,
    memory: 20,
    tasksCompleted: 4,
    currentTask: null,
    taskProgress: 0,
    color: "#22d3ee",
    pixelX: 0,
    pixelY: 0,
    targetX: 0,
    targetY: 0,
    frame: 0,
    direction: "right",
    spriteId: 0,
    appearance: { skin: "default", accessories: [], customColor: null },
    skills: [
      { id: "skill-1", name: "Research", level: 1, maxLevel: 5, xp: 40, xpToNext: 50 },
    ],
    ...overrides,
  }
}

describe("gamification progression", () => {
  it("awards task XP, increments completed tasks, and levels eligible skills", () => {
    const result = awardTaskXpToAgent(makeAgent())

    expect(result.xpAwarded).toBe(25)
    expect(result.agent.tasksCompleted).toBe(5)
    expect(result.agent.skills[0]).toMatchObject({ level: 2, xp: 15, xpToNext: 150 })
    expect(result.leveledSkills).toHaveLength(1)
  })

  it("returns a daily quest badge with a Soroban attestation id", () => {
    const agent = makeAgent({ tasksCompleted: 5 })
    const badges = getEarnedBadges(agent, [agent])

    expect(badges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "daily-operator",
        onChainAttestation: "soroban-attestation:bot-test:daily-operator",
      }),
    ]))
  })

  it("ranks leaderboard rows by tasks completed", () => {
    const low = makeAgent({ id: "low", name: "Low", tasksCompleted: 2 })
    const high = makeAgent({ id: "high", name: "High", tasksCompleted: 20 })

    const rows = getLeaderboardRows([low, high])

    expect(rows[0].agent.id).toBe("high")
    expect(rows[0].rank).toBe(1)
  })
})
