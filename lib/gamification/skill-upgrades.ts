import type { MoltbotAgent, Skill } from "@/lib/types"

export const SKILL_UPGRADE_COSTS: Record<number, number> = {
  1: 50,
  2: 150,
  3: 400,
  4: 1000,
}

export interface SkillUpgradeState {
  cost: number | null
  canUpgrade: boolean
  isMaxLevel: boolean
  progressPct: number
  xpAfterUpgrade: number | null
}

export interface SkillUpgradeResult {
  skill: Skill
  upgraded: boolean
  previousLevel: number
  reason?: "max-level" | "not-enough-xp"
}

export function getSkillUpgradeCost(skill: Pick<Skill, "level" | "maxLevel">): number | null {
  if (skill.level >= skill.maxLevel) return null

  const configuredCost = SKILL_UPGRADE_COSTS[skill.level]
  if (configuredCost) return configuredCost

  const levelsPastTable = Math.max(0, skill.level - 4)
  return Math.round(SKILL_UPGRADE_COSTS[4] * Math.pow(1.8, levelsPastTable))
}

export function getSkillUpgradeState(skill: Skill): SkillUpgradeState {
  const cost = getSkillUpgradeCost(skill)
  const isMaxLevel = cost === null
  const progressPct = isMaxLevel ? 100 : Math.min(100, Math.round((skill.xp / cost) * 100))

  return {
    cost,
    canUpgrade: cost !== null && skill.xp >= cost,
    isMaxLevel,
    progressPct,
    xpAfterUpgrade: cost === null ? null : Math.max(0, skill.xp - cost),
  }
}

export function upgradeSkill(skill: Skill): SkillUpgradeResult {
  const state = getSkillUpgradeState(skill)

  if (state.isMaxLevel) {
    return {
      skill,
      upgraded: false,
      previousLevel: skill.level,
      reason: "max-level",
    }
  }

  if (!state.canUpgrade || state.cost === null) {
    return {
      skill,
      upgraded: false,
      previousLevel: skill.level,
      reason: "not-enough-xp",
    }
  }

  const nextLevel = skill.level + 1
  const nextSkill = {
    ...skill,
    level: nextLevel,
    xp: state.xpAfterUpgrade ?? 0,
    xpToNext: getSkillUpgradeCost({ level: nextLevel, maxLevel: skill.maxLevel }) ?? 0,
  }

  return {
    skill: nextSkill,
    upgraded: true,
    previousLevel: skill.level,
  }
}

export function upgradeAgentSkill(agent: MoltbotAgent, skillId: string): { agent: MoltbotAgent; result: SkillUpgradeResult | null } {
  let result: SkillUpgradeResult | null = null

  const skills = agent.skills.map((skill) => {
    if (skill.id !== skillId) return skill
    result = upgradeSkill(skill)
    return result.skill
  })

  if (!result) {
    return { agent, result: null }
  }

  return {
    agent: {
      ...agent,
      skills,
    },
    result,
  }
}
