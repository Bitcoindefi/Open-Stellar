import { describe, expect, it } from "vitest"
import type { MoltbotAgent, Skill } from "@/lib/types"
import {
  getSkillUpgradeCost,
  getSkillUpgradeState,
  upgradeAgentSkill,
  upgradeSkill,
} from "@/lib/gamification/skill-upgrades"

const baseSkill: Skill = {
  id: "skill-1",
  name: "Threat Detection",
  level: 1,
  maxLevel: 5,
  xp: 50,
  xpToNext: 50,
}

function makeAgent(skill: Skill): MoltbotAgent {
  return {
    id: "bot-1",
    name: "Nexus-7",
    model: "claude-3.5-haiku",
    status: "active",
    district: "defense",
    cpu: 42,
    memory: 61,
    tasksCompleted: 12,
    currentTask: null,
    taskProgress: 0,
    color: "#f87171",
    pixelX: 10,
    pixelY: 20,
    targetX: 10,
    targetY: 20,
    frame: 0,
    direction: "right",
    spriteId: 1,
    skills: [skill],
    appearance: { skin: "default", accessories: [], customColor: null },
  }
}

describe("skill upgrade helpers", () => {
  it("uses the requested XP cost table for levels one through four", () => {
    expect(getSkillUpgradeCost({ level: 1, maxLevel: 5 })).toBe(50)
    expect(getSkillUpgradeCost({ level: 2, maxLevel: 5 })).toBe(150)
    expect(getSkillUpgradeCost({ level: 3, maxLevel: 5 })).toBe(400)
    expect(getSkillUpgradeCost({ level: 4, maxLevel: 5 })).toBe(1000)
    expect(getSkillUpgradeCost({ level: 5, maxLevel: 5 })).toBeNull()
  })

  it("reports upgrade readiness and leftover XP", () => {
    const state = getSkillUpgradeState({ ...baseSkill, xp: 75 })

    expect(state.canUpgrade).toBe(true)
    expect(state.cost).toBe(50)
    expect(state.xpAfterUpgrade).toBe(25)
    expect(state.progressPct).toBe(100)
  })

  it("upgrades a skill, spends XP, and updates the next cost", () => {
    const result = upgradeSkill({ ...baseSkill, xp: 75 })

    expect(result.upgraded).toBe(true)
    expect(result.previousLevel).toBe(1)
    expect(result.skill.level).toBe(2)
    expect(result.skill.xp).toBe(25)
    expect(result.skill.xpToNext).toBe(150)
  })

  it("blocks upgrades without enough XP or when maxed", () => {
    expect(upgradeSkill({ ...baseSkill, xp: 49 }).reason).toBe("not-enough-xp")
    expect(upgradeSkill({ ...baseSkill, level: 5, xp: 5000, xpToNext: 0 }).reason).toBe("max-level")
  })

  it("updates only the targeted agent skill", () => {
    const agent = makeAgent({ ...baseSkill, xp: 75 })
    const { agent: updatedAgent, result } = upgradeAgentSkill(agent, "skill-1")

    expect(result?.upgraded).toBe(true)
    expect(updatedAgent.skills[0].level).toBe(2)
    expect(updatedAgent.skills[0].xp).toBe(25)
  })
})
