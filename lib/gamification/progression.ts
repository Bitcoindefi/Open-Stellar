import { BADGES, getUnlockedBadgeIds } from "@/lib/cosmetics"
import type { MoltbotAgent, Skill } from "@/lib/types"
import { getSkillUpgradeCost } from "@/lib/gamification/skill-upgrades"

export const TASK_COMPLETION_XP = 25
export const DAILY_QUEST_TASK_TARGET = 5

export interface EarnedBadge {
  id: string
  name: string
  description: string
  onChainAttestation: string
}

export interface TaskXpAwardResult {
  agent: MoltbotAgent
  xpAwarded: number
  leveledSkills: Skill[]
}

export interface LeaderboardRow {
  rank: number
  agent: MoltbotAgent
  totalSkillLevel: number
  badges: EarnedBadge[]
}

function buildBadgeAttestation(agentId: string, badgeId: string): string {
  return `soroban-attestation:${agentId}:${badgeId}`
}

function applyXpToSkill(skill: Skill, xpAwarded: number): { skill: Skill; leveled: boolean } {
  if (skill.level >= skill.maxLevel) {
    return { skill, leveled: false }
  }

  let nextSkill = { ...skill, xp: skill.xp + xpAwarded }
  let leveled = false

  while (nextSkill.level < nextSkill.maxLevel) {
    const cost = getSkillUpgradeCost(nextSkill)
    if (cost === null || nextSkill.xp < cost) break

    const nextLevel = nextSkill.level + 1
    nextSkill = {
      ...nextSkill,
      level: nextLevel,
      xp: nextSkill.xp - cost,
      xpToNext: getSkillUpgradeCost({ level: nextLevel, maxLevel: nextSkill.maxLevel }) ?? 0,
    }
    leveled = true
  }

  return { skill: nextSkill, leveled }
}

export function awardTaskXpToAgent(agent: MoltbotAgent, xpAwarded = TASK_COMPLETION_XP): TaskXpAwardResult {
  if (agent.skills.length === 0) {
    return { agent, xpAwarded, leveledSkills: [] }
  }

  const skillIndex = agent.tasksCompleted % agent.skills.length
  const leveledSkills: Skill[] = []
  const skills = agent.skills.map((skill, index) => {
    if (index !== skillIndex) return skill
    const result = applyXpToSkill(skill, xpAwarded)
    if (result.leveled) leveledSkills.push(result.skill)
    return result.skill
  })

  return {
    agent: {
      ...agent,
      skills,
      tasksCompleted: agent.tasksCompleted + 1,
    },
    xpAwarded,
    leveledSkills,
  }
}

export function getEarnedBadges(agent: MoltbotAgent, allAgents: MoltbotAgent[]): EarnedBadge[] {
  const unlocked = new Set(getUnlockedBadgeIds(agent, allAgents))

  if (agent.tasksCompleted >= DAILY_QUEST_TASK_TARGET) {
    unlocked.add("daily-operator")
  }

  return [
    ...BADGES,
    {
      id: "daily-operator",
      name: "Daily Operator",
      description: `Completed ${DAILY_QUEST_TASK_TARGET} daily quest tasks`,
      isUnlocked: () => true,
    },
  ]
    .filter((badge) => unlocked.has(badge.id))
    .map((badge) => ({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      onChainAttestation: buildBadgeAttestation(agent.id, badge.id),
    }))
}

export function getLeaderboardRows(agents: MoltbotAgent[]): LeaderboardRow[] {
  return [...agents]
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted || a.name.localeCompare(b.name))
    .map((agent, index) => ({
      rank: index + 1,
      agent,
      totalSkillLevel: agent.skills.reduce((sum, skill) => sum + skill.level, 0),
      badges: getEarnedBadges(agent, agents),
    }))
}
