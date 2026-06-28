import type { MoltbotAgent, Skill } from "@/lib/types"
import { publishSystemEvent } from "@/lib/events/system-events"
import {
  AGENT_LEVEL_CAP,
  FAST_TASK_MAX_DURATION_MS,
  FIRST_LEVEL_XP_THRESHOLD,
  LEVEL_XP_MULTIPLIER,
  XP_AWARDS,
} from "@/lib/gamification/constants"
import { getSkillUpgradeCost } from "@/lib/gamification/skill-upgrades"

export type XPAwardReason =
  | "task.completed"
  | "task.completed.fast"
  | "payment.received"
  | "subscription.acquired"
  | "passport.minted"
  | "uptime.24h.no-errors"
  | "quest.completed"

export interface AgentXPRecord {
  agentId: string
  xp: number
  level: number
}

export interface XPAwardResult extends AgentXPRecord {
  awardedXp: number
  reason: XPAwardReason
  previousXp: number
  previousLevel: number
  leveledUp: boolean
}

export interface TaskXpInput {
  agentId: string
  durationMs?: number
  skillId?: string
}

export function resetAgentXpDb(): void {
  agentXpDb.clear()
}

type AgentXPDb = Map<string, AgentXPRecord>

const globalXp = globalThis as typeof globalThis & {
  __openStellarAgentXpDb__?: AgentXPDb
}

const agentXpDb: AgentXPDb = globalXp.__openStellarAgentXpDb__ ?? new Map()
if (!globalXp.__openStellarAgentXpDb__) {
  globalXp.__openStellarAgentXpDb__ = agentXpDb
}

export function getXpToNextLevel(level: number): number {
  if (level >= AGENT_LEVEL_CAP) return 0
  let total = 0
  for (let currentLevel = 1; currentLevel <= level; currentLevel += 1) {
    total += Math.round(FIRST_LEVEL_XP_THRESHOLD * Math.pow(LEVEL_XP_MULTIPLIER, Math.max(0, currentLevel - 1)))
  }
  return total
}

export function checkLevelUp(xp: number, currentLevel = 1): { level: number; xpToNext: number; leveledUp: boolean } {
  let level = Math.max(1, Math.min(AGENT_LEVEL_CAP, Math.floor(currentLevel)))
  const previousLevel = level

  while (level < AGENT_LEVEL_CAP && xp >= getXpToNextLevel(level)) {
    level += 1
  }

  return {
    level,
    xpToNext: getXpToNextLevel(level),
    leveledUp: level > previousLevel,
  }
}

export function getAgentXP(agentId: string): AgentXPRecord {
  return agentXpDb.get(agentId) ?? { agentId, xp: 0, level: 1 }
}

export function awardXP(agentId: string, amount: number, reason: XPAwardReason): XPAwardResult {
  const previous = getAgentXP(agentId)
  const awardedXp = Math.max(0, Math.round(amount))
  const xp = previous.xp + awardedXp
  const levelState = checkLevelUp(xp, previous.level)
  const next: AgentXPRecord = { agentId, xp, level: levelState.level }
  agentXpDb.set(agentId, next)

  const result: XPAwardResult = {
    ...next,
    awardedXp,
    reason,
    previousXp: previous.xp,
    previousLevel: previous.level,
    leveledUp: levelState.leveledUp,
  }

  publishSystemEvent({
    type: "agent.xp",
    agentId,
    xp: awardedXp,
    totalXp: xp,
    level: next.level,
    xpToNext: levelState.xpToNext,
    reason,
  })

  if (reason === "quest.completed") {
    publishSystemEvent({
      type: "quest.completed",
      agentId,
      reward: { xp: awardedXp },
    })
  }

  return result
}

export function awardTaskXP(input: TaskXpInput): XPAwardResult[] {
  const awards = [awardXP(input.agentId, XP_AWARDS.TASK_COMPLETED, "task.completed")]
  if (typeof input.durationMs === "number" && input.durationMs <= FAST_TASK_MAX_DURATION_MS) {
    awards.push(awardXP(input.agentId, XP_AWARDS.FAST_TASK_BONUS, "task.completed.fast"))
  }
  return awards
}

export function awardSkillXP(skills: Skill[], skillId: string | undefined, amount: number): Skill[] {
  if (!skillId) return skills

  return skills.map((skill) => {
    if (skill.id !== skillId) return skill
    const xp = skill.xp + Math.max(0, Math.round(amount))
    return {
      ...skill,
      xp,
      xpToNext: getSkillUpgradeCost({ level: skill.level, maxLevel: skill.maxLevel }) ?? 0,
    }
  })
}

export function applyXPAwardToAgent(agent: MoltbotAgent, award: Pick<XPAwardResult, "xp" | "level">): MoltbotAgent {
  return {
    ...agent,
    xp: award.xp,
    level: award.level,
    xpToNext: getXpToNextLevel(award.level),
  }
}
