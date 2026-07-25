import { describe, expect, it } from "vitest"
import { XP_AWARDS } from "@/lib/gamification/constants"
import { awardSkillXP, checkLevelUp, getXpToNextLevel } from "@/lib/gamification/xp"
import type { Skill } from "@/lib/types"

describe("XP leveling", () => {
  it("uses cumulative 1.5x level thresholds", () => {
    expect(getXpToNextLevel(1)).toBe(100)
    expect(getXpToNextLevel(2)).toBe(250)
    expect(getXpToNextLevel(3)).toBe(475)
  })

  it("levels up when total XP crosses the next threshold", () => {
    expect(checkLevelUp(99, 1)).toMatchObject({ level: 1, leveledUp: false })
    expect(checkLevelUp(100, 1)).toMatchObject({ level: 2, leveledUp: true, xpToNext: 250 })
    expect(checkLevelUp(475, 1)).toMatchObject({ level: 4, leveledUp: true })
  })

  it("adds task XP to the matching skill without changing other skills", () => {
    const skills: Skill[] = [
      { id: "data", name: "Data Mining", level: 1, maxLevel: 5, xp: 0, xpToNext: 50 },
      { id: "ops", name: "Backup Ops", level: 1, maxLevel: 5, xp: 0, xpToNext: 50 },
    ]

    expect(awardSkillXP(skills, "data", XP_AWARDS.TASK_COMPLETED)).toEqual([
      { id: "data", name: "Data Mining", level: 1, maxLevel: 5, xp: 10, xpToNext: 50 },
      { id: "ops", name: "Backup Ops", level: 1, maxLevel: 5, xp: 0, xpToNext: 50 },
    ])
  })
})
