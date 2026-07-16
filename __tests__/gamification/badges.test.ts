import { describe, expect, it, beforeEach } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { BADGE_DEFINITIONS, checkAndAwardBadges, recordTaskCompletion, resetAgentBadgesForTests } from "@/lib/gamification/badges"

const badgePath = join(process.cwd(), ".data", "agent-badges.json")

describe("gamification badges", () => {
  beforeEach(() => {
    resetAgentBadgesForTests()
  })

  it("defines all milestone badges with display metadata and conditions", () => {
    expect(BADGE_DEFINITIONS.map((badge) => badge.id)).toEqual([
      "first_task",
      "speed_runner",
      "top_earner",
      "quest_master",
      "early_adopter",
    ])

    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.name).toBeTruthy()
      expect(badge.description).toBeTruthy()
      expect(badge.iconName).toBeTruthy()
      expect(badge.unlockCondition).toBeTruthy()
    }
  })

  it("awards badges idempotently and persists the badge file", () => {
    recordTaskCompletion("badge-agent", "2026-06-30T00:00:00.000Z")

    const first = checkAndAwardBadges("badge-agent", new Date("2026-06-30T00:01:00.000Z"))
    const second = checkAndAwardBadges("badge-agent", new Date("2026-06-30T00:02:00.000Z"))

    expect(first.some((badge) => badge.badgeId === "first_task")).toBe(true)
    expect(second.some((badge) => badge.badgeId === "first_task")).toBe(false)
    expect(existsSync(badgePath)).toBe(true)

    const persisted = JSON.parse(readFileSync(badgePath, "utf8"))
    expect(persisted.agentBadges["badge-agent"].filter((badge: { badgeId: string }) => badge.badgeId === "first_task")).toHaveLength(1)
  })

  it("awards speed runner for 10 tasks inside one hour", () => {
    for (let i = 0; i < 10; i += 1) {
      recordTaskCompletion("fast-agent", new Date(Date.UTC(2026, 5, 30, 12, i, 0)).toISOString())
    }

    const awarded = checkAndAwardBadges("fast-agent", new Date("2026-06-30T13:00:00.000Z"))
    expect(awarded.some((badge) => badge.badgeId === "speed_runner")).toBe(true)
  })
})
