import { DISTRICTS } from "@/lib/data"
import type { DistrictId } from "@/lib/types"
import { getBadgeCatalogEntry, type BadgeRarity } from "@/lib/gamification/badge-catalog"
import { getReputation } from "@/lib/reputation/reputation-store"

export type LeaderboardView = "global" | "district" | "week"

/** Structured badge data embedded in each leaderboard row. */
export interface LeaderboardBadge {
  id: string
  name: string
  rarity: BadgeRarity
  earnedAt: string
}

export interface LeaderboardAgent {
  id: string
  name: string
  district: DistrictId
  districtName: string
  districtColor: string
  tasksCompleted: number
  weeklyTasks: number
  level: number
  xp: number
  x402Revenue: number
  spriteId: number
  /** Legacy emoji badges – kept for backwards compat; use badgeIcons for display. */
  badges: string[]
  /** Structured badge data fetched from /api/agents/[id]/badges (up to all earned). */
  badgeIcons: LeaderboardBadge[]
  rank: number
  previousRank: number
  districtRank: number
  globalRank: number
}

/**
 * Resolve structured badge data for a single agent from the reputation store.
 * Pure synchronous read – no HTTP round-trip, so parallel fan-out across many
 * agents has zero waterfall latency. Exported so both the server page and the
 * /api/leaderboard route can share the exact same resolution logic.
 */
export function resolveBadgesForAgent(agentId: string): LeaderboardBadge[] {
  try {
    const { metrics } = getReputation(agentId)
    return (metrics.badges ?? [])
      .map((b) => {
        const catalog = getBadgeCatalogEntry(b.id)
        return {
          id: b.id,
          name: catalog?.name ?? b.id,
          rarity: (b.rarity as BadgeRarity) ?? "common",
          earnedAt: b.awardedAt,
        }
      })
      .sort((a, z) => new Date(z.earnedAt).getTime() - new Date(a.earnedAt).getTime())
  } catch {
    // Agent has no reputation record – return empty array gracefully.
    return []
  }
}

const BASE_AGENTS = [
  ["bot-0", "Nexus-7", "data-center", 1234, 184, 42, 88400, 812.44, 3, ["🏆", "⚡", "💾"]],
  ["bot-1", "Cipher-3", "comm-hub", 987, 211, 38, 73120, 663.1, 1, ["📡", "🔐"]],
  ["bot-2", "Pulse-9", "processing", 934, 176, 36, 69450, 590.73, 4, ["⚙️", "🔥"]],
  ["bot-3", "Vector-1", "defense", 876, 148, 34, 63100, 551.92, 5, ["🛡️", "🎯"]],
  ["bot-4", "Halo-5", "research", 822, 193, 33, 60540, 522.18, 2, ["🧪", "💡"]],
  ["bot-5", "Stratos-2", "data-center", 760, 121, 31, 54790, 487.35, 0, ["💾"]],
  ["bot-6", "Bolt-8", "comm-hub", 715, 117, 29, 51410, 439.27, 6, ["⚡"]],
  ["bot-7", "Prism-4", "processing", 681, 99, 28, 49620, 418.04, 2, ["⚙️"]],
  ["bot-8", "Flux-6", "defense", 642, 136, 27, 47180, 392.66, 4, ["🛡️"]],
  ["bot-9", "Nova-0", "research", 604, 104, 25, 44980, 361.89, 3, ["🧪"]],
  ["bot-10", "Vertex-11", "data-center", 571, 88, 24, 41320, 337.2, 1, ["📈"]],
  ["bot-11", "Echo-12", "comm-hub", 548, 82, 23, 39870, 321.74, 0, ["📡"]],
] as const

function jitter(seed: number, modulo: number): number {
  return Math.floor(Date.now() / 30000 + seed * 13) % modulo
}

export function listLeaderboardAgents(view: LeaderboardView = "global", district?: DistrictId, hydrateBadges = false): LeaderboardAgent[] {
  const rows = BASE_AGENTS.map((agent, index) => {
    const districtMeta = DISTRICTS.find((item) => item.id === agent[2])!
    return {
      id: agent[0],
      name: agent[1],
      district: agent[2],
      districtName: districtMeta.name,
      districtColor: districtMeta.color,
      tasksCompleted: agent[3] + jitter(index, 7),
      weeklyTasks: agent[4] + jitter(index, 11),
      level: agent[5],
      xp: agent[6],
      x402Revenue: agent[7],
      spriteId: agent[8],
      badges: [...agent[9]],
      badgeIcons: [],
      rank: 0,
      previousRank: 0,
      districtRank: 0,
      globalRank: 0,
    }
  })

  const global = [...rows].sort((a, b) => b.tasksCompleted - a.tasksCompleted)
  global.forEach((row, index) => { row.globalRank = index + 1 })

  for (const districtMeta of DISTRICTS) {
    rows
      .filter((row) => row.district === districtMeta.id)
      .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
      .forEach((row, index) => { row.districtRank = index + 1 })
  }

  const filtered = district ? rows.filter((row) => row.district === district) : rows
  const sorted = [...filtered].sort((a, b) => (view === "week" ? b.weeklyTasks - a.weeklyTasks : b.tasksCompleted - a.tasksCompleted))
  const ranked = sorted.map((row, index) => ({ ...row, rank: index + 1, previousRank: Math.max(1, index + 1 + ((index % 3) - 1)) }))

  if (hydrateBadges) {
    for (const agent of ranked) {
      agent.badgeIcons = resolveBadgesForAgent(agent.id)
    }
  }

  return ranked
}

export function getLeaderboardAgent(agentId: string): LeaderboardAgent | undefined {
  return listLeaderboardAgents("global", undefined, true).find((agent) => agent.id === agentId)
}
