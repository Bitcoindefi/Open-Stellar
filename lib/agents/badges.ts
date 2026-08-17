import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { publishSystemEvent } from "@/lib/events/system-events"
import { listRegisteredAgents, getRegisteredAgent } from "@/lib/agent-registry"
import { getAgentXP } from "@/lib/gamification/xp"
import { countClaimedQuests } from "@/lib/gamification/quest-completions"

export type BadgeType = "first_task" | "quest_master" | "level_10" | "veteran" | "top_earner"

export interface Badge {
  type: BadgeType
  name: string
  description: string
  icon: string
  awardedAt: string
}

const BADGES_DIR = join(process.cwd(), ".data", "badges")
const VETERAN_DAYS = 30

export const BADGE_DEFINITIONS: Record<BadgeType, Omit<Badge, "awardedAt">> = {
  first_task: {
    type: "first_task",
    name: "First Task",
    description: "Completed the first tracked task.",
    icon: "check-circle",
  },
  quest_master: {
    type: "quest_master",
    name: "Quest Master",
    description: "Completed 5 quests.",
    icon: "scroll",
  },
  level_10: {
    type: "level_10",
    name: "Level 10",
    description: "Reached level 10.",
    icon: "sparkles",
  },
  veteran: {
    type: "veteran",
    name: "Veteran",
    description: "Stayed registered for 30 days.",
    icon: "shield",
  },
  top_earner: {
    type: "top_earner",
    name: "Top Earner",
    description: "Reached the top 10% of the XP leaderboard.",
    icon: "trophy",
  },
}

function ensureBadgesDir(): void {
  if (!existsSync(BADGES_DIR)) {
    mkdirSync(BADGES_DIR, { recursive: true })
  }
}

function agentBadgesPath(agentId: string): string {
  return join(BADGES_DIR, `${encodeURIComponent(agentId)}.json`)
}

function readAgentBadges(agentId: string): Badge[] {
  ensureBadgesDir()
  const filePath = agentBadgesPath(agentId)
  if (!existsSync(filePath)) {
    return []
  }

  try {
    const raw = readFileSync(filePath, "utf8").trim()
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as Badge[]) : []
  } catch {
    return []
  }
}

function writeAgentBadges(agentId: string, badges: Badge[]): void {
  ensureBadgesDir()
  writeFileSync(agentBadgesPath(agentId), `${JSON.stringify(badges, null, 2)}\n`, "utf8")
}

function hasBadge(badges: Badge[], type: BadgeType): boolean {
  return badges.some((badge) => badge.type === type)
}

function isVeteran(agentId: string, nowMs: number): boolean {
  const agent = getRegisteredAgent(agentId)
  if (!agent) return false
  const registeredMs = new Date(agent.registeredAt).getTime()
  if (!Number.isFinite(registeredMs)) return false
  return nowMs - registeredMs >= VETERAN_DAYS * 24 * 60 * 60 * 1000
}

function isTopEarner(agentId: string): boolean {
  const agents = listRegisteredAgents()
  if (agents.length === 0) return false

  const ranked = agents
    .map((agent) => ({ agentId: agent.agentId, xp: getAgentXP(agent.agentId).xp }))
    .sort((a, b) => b.xp - a.xp || a.agentId.localeCompare(b.agentId))

  const cutoff = Math.max(1, Math.ceil(ranked.length * 0.1))
  return ranked.slice(0, cutoff).some((entry) => entry.agentId === agentId)
}

function shouldAward(type: BadgeType, agentId: string, nowMs: number): boolean {
  if (type === "first_task") {
    return getAgentXP(agentId).xp > 0
  }
  if (type === "quest_master") {
    return countClaimedQuests(agentId) >= 5
  }
  if (type === "level_10") {
    return getAgentXP(agentId).level >= 10
  }
  if (type === "veteran") {
    return isVeteran(agentId, nowMs)
  }
  return isTopEarner(agentId)
}

export function getAgentBadges(agentId: string): Badge[] {
  return readAgentBadges(agentId)
}

export function listBadgeCatalog(): Array<Omit<Badge, "awardedAt">> {
  return Object.values(BADGE_DEFINITIONS)
}

export function getBadgeEarnedByCounts(): Record<BadgeType, number> {
  ensureBadgesDir()
  const counts = {
    first_task: 0,
    quest_master: 0,
    level_10: 0,
    veteran: 0,
    top_earner: 0,
  } satisfies Record<BadgeType, number>

  for (const entry of readdirSync(BADGES_DIR)) {
    if (!entry.endsWith(".json")) continue
    const raw = readFileSync(join(BADGES_DIR, entry), "utf8").trim()
    if (!raw) continue
    const badges = JSON.parse(raw) as Badge[]
    const seen = new Set<BadgeType>()
    for (const badge of badges) {
      if (seen.has(badge.type)) continue
      seen.add(badge.type)
      counts[badge.type] += 1
    }
  }

  return counts
}

export function checkAndAwardBadges(agentId: string, now = new Date()): Badge[] {
  const cleanId = agentId.trim()
  if (!cleanId) return []

  const existing = readAgentBadges(cleanId)
  const next = [...existing]
  const awarded: Badge[] = []
  const nowIso = now.toISOString()
  const nowMs = now.getTime()

  for (const type of Object.keys(BADGE_DEFINITIONS) as BadgeType[]) {
    if (hasBadge(next, type)) continue
    if (!shouldAward(type, cleanId, nowMs)) continue

    const badge: Badge = {
      ...BADGE_DEFINITIONS[type],
      awardedAt: nowIso,
    }
    next.push(badge)
    awarded.push(badge)
    publishSystemEvent({
      type: "badge.unlocked",
      agentId: cleanId,
      badge: {
        id: badge.type,
        name: badge.name,
      },
    })
  }

  if (awarded.length > 0) {
    writeAgentBadges(cleanId, next)
  }

  return awarded
}

export function resetBadgeStoreForTests(): void {
  ensureBadgesDir()
  for (const entry of readdirSync(BADGES_DIR)) {
    if (entry.endsWith(".json")) {
      rmSync(join(BADGES_DIR, entry), { force: true })
    }
  }
}
