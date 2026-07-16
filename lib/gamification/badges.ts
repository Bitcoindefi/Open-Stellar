import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { listAgentHealth } from "@/lib/agents/agent-health-store"
import { listRegisteredAgents } from "@/lib/agent-registry"
import { getAgentXP } from "@/lib/gamification/xp"
import { getAgentQuestStats } from "@/lib/gamification/quest-leaderboard"
import { getReputation, upsertReputationMetrics } from "@/lib/reputation/reputation-store"
import { publishSystemEvent } from "@/lib/events/system-events"
import type { BadgeRarity } from "@/lib/gamification/badge-catalog"

export type BadgeId = "first_task" | "speed_runner" | "top_earner" | "quest_master" | "early_adopter"

export interface BadgeDefinition {
  id: BadgeId
  name: string
  description: string
  iconName: string
  rarity: BadgeRarity
  unlockCondition: string
}

export interface EarnedBadge {
  badgeId: BadgeId
  earnedAt: string
}

interface BadgeStoreState {
  agentBadges: Record<string, EarnedBadge[]>
  taskCompletions: Record<string, string[]>
}

const BADGES_PATH = join(process.cwd(), ".data", "agent-badges.json")
const ONE_HOUR_MS = 60 * 60 * 1000

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "first_task",
    name: "First Task",
    description: "Complete your first task.",
    iconName: "check-circle",
    rarity: "common",
    unlockCondition: "Complete at least one task.",
  },
  {
    id: "speed_runner",
    name: "Speed Runner",
    description: "Complete 10 tasks in under 1 hour.",
    iconName: "zap",
    rarity: "rare",
    unlockCondition: "Complete 10 recorded tasks within any rolling 60 minute window.",
  },
  {
    id: "top_earner",
    name: "Top Earner",
    description: "Reach top 10 on the leaderboard.",
    iconName: "trophy",
    rarity: "epic",
    unlockCondition: "Place in the top 10 agents by XP leaderboard rank.",
  },
  {
    id: "quest_master",
    name: "Quest Master",
    description: "Complete 5 quests in a single week.",
    iconName: "scroll-text",
    rarity: "rare",
    unlockCondition: "Complete at least 5 quests in the current weekly quest window.",
  },
  {
    id: "early_adopter",
    name: "Early Adopter",
    description: "One of the first 50 registered agents.",
    iconName: "sparkles",
    rarity: "legendary",
    unlockCondition: "Be among the first 50 agents in registry registration order.",
  },
]

const definitionIndex = new Map(BADGE_DEFINITIONS.map((badge) => [badge.id, badge]))

function emptyState(): BadgeStoreState {
  return { agentBadges: {}, taskCompletions: {} }
}

function readState(): BadgeStoreState {
  if (!existsSync(BADGES_PATH)) return emptyState()
  try {
    const parsed = JSON.parse(readFileSync(BADGES_PATH, "utf8")) as Partial<BadgeStoreState>
    return {
      agentBadges: parsed.agentBadges && typeof parsed.agentBadges === "object" ? parsed.agentBadges : {},
      taskCompletions: parsed.taskCompletions && typeof parsed.taskCompletions === "object" ? parsed.taskCompletions : {},
    }
  } catch {
    return emptyState()
  }
}

function writeState(state: BadgeStoreState): void {
  mkdirSync(dirname(BADGES_PATH), { recursive: true })
  const tmp = `${BADGES_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8")
  renameSync(tmp, BADGES_PATH)
}

function rollingWindowHasTenTasks(completedAtValues: string[]): boolean {
  const times = completedAtValues.map((value) => new Date(value).getTime()).filter(Number.isFinite).sort((a, b) => a - b)
  for (let i = 0; i < times.length; i += 1) {
    const tenth = times[i + 9]
    if (tenth !== undefined && tenth - times[i] <= ONE_HOUR_MS) return true
  }
  return false
}

function getXpLeaderboardRank(agentId: string): number | null {
  const agents = listAgentHealth()
    .map((health) => ({ agentId: health.agentId, xp: getAgentXP(health.agentId).xp }))
    .sort((a, b) => b.xp - a.xp || a.agentId.localeCompare(b.agentId))

  const index = agents.findIndex((agent) => agent.agentId === agentId)
  return index === -1 ? null : index + 1
}

function isEarlyAdopter(agentId: string): boolean {
  return listRegisteredAgents()
    .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt) || a.agentId.localeCompare(b.agentId))
    .slice(0, 50)
    .some((agent) => agent.agentId === agentId)
}

function shouldAwardBadge(agentId: string, badgeId: BadgeId, state: BadgeStoreState): boolean {
  if (badgeId === "first_task") return (state.taskCompletions[agentId]?.length ?? 0) >= 1
  if (badgeId === "speed_runner") return rollingWindowHasTenTasks(state.taskCompletions[agentId] ?? [])
  if (badgeId === "top_earner") return (getXpLeaderboardRank(agentId) ?? Number.POSITIVE_INFINITY) <= 10
  if (badgeId === "quest_master") return getAgentQuestStats(agentId, "weekly").questsCompleted >= 5
  if (badgeId === "early_adopter") return isEarlyAdopter(agentId)
  return false
}

function mirrorBadgeToReputation(agentId: string, badge: EarnedBadge): void {
  const definition = definitionIndex.get(badge.badgeId)
  const current = getReputation(agentId)
  if (current.metrics.badges.some((entry) => entry.id === badge.badgeId)) return
  upsertReputationMetrics(agentId, {
    ...current.metrics,
    badges: [...current.metrics.badges, { id: badge.badgeId, rarity: definition?.rarity ?? "common", awardedAt: badge.earnedAt }],
  })
}

export function getBadgeDefinition(badgeId: string): BadgeDefinition | undefined {
  return definitionIndex.get(badgeId as BadgeId)
}

export function listEarnedBadges(agentId: string): EarnedBadge[] {
  return [...(readState().agentBadges[agentId] ?? [])].sort(
    (a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime(),
  )
}

export function recordTaskCompletion(agentId: string, completedAt = new Date().toISOString()): void {
  const state = readState()
  const taskCompletions = state.taskCompletions[agentId] ?? []
  state.taskCompletions[agentId] = [...taskCompletions, completedAt]
  writeState(state)
}

export function checkAndAwardBadges(agentId: string, now = new Date()): EarnedBadge[] {
  const state = readState()
  const existing = new Set((state.agentBadges[agentId] ?? []).map((badge) => badge.badgeId))
  const newlyAwarded: EarnedBadge[] = []

  for (const definition of BADGE_DEFINITIONS) {
    if (existing.has(definition.id) || !shouldAwardBadge(agentId, definition.id, state)) continue
    const earned: EarnedBadge = { badgeId: definition.id, earnedAt: now.toISOString() }
    state.agentBadges[agentId] = [...(state.agentBadges[agentId] ?? []), earned]
    existing.add(definition.id)
    newlyAwarded.push(earned)
    mirrorBadgeToReputation(agentId, earned)
    publishSystemEvent({
      type: "badge.unlocked",
      agentId,
      badge: { id: definition.id, name: definition.name, rarity: definition.rarity },
    })
  }

  if (newlyAwarded.length > 0) writeState(state)
  return newlyAwarded
}

export function resetAgentBadgesForTests(): void {
  writeState(emptyState())
}
