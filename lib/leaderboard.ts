import { getAgentRegistry } from "@/lib/agent-registry"
import { DISTRICTS } from "@/lib/data"
import { getAgentXP } from "@/lib/gamification/xp"
import { getReputation } from "@/lib/reputation/reputation-store"
import type { DistrictId } from "@/lib/types"

export type LeaderboardView = "global" | "district" | "week"

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
  badges: string[]
  rank: number
  previousRank: number
  districtRank: number
  globalRank: number
}

function spriteIdForAgent(agentId: string): number {
  return [...agentId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7
}

function badgesForAgent(capabilities: string[]): string[] {
  return capabilities.slice(0, 3).map((capability) => capability.slice(0, 2).toUpperCase())
}

function toLeaderboardAgent(agent: ReturnType<typeof getAgentRegistry>[number]): LeaderboardAgent {
  const districtMeta = DISTRICTS.find((item) => item.id === agent.district)!
  const xp = getAgentXP(agent.agentId)
  const reputation = getReputation(agent.agentId)

  return {
    id: agent.agentId,
    name: agent.agentId,
    district: agent.district,
    districtName: districtMeta.name,
    districtColor: districtMeta.color,
    tasksCompleted: reputation.metrics.tasksCompleted,
    weeklyTasks: reputation.metrics.tasksCompleted,
    level: xp.level,
    xp: xp.xp,
    x402Revenue: reputation.metrics.x402RevenueXlm,
    spriteId: spriteIdForAgent(agent.agentId),
    badges: badgesForAgent(agent.capabilities),
    rank: 0,
    previousRank: 0,
    districtRank: 0,
    globalRank: 0,
  }
}

function compareByXp(a: LeaderboardAgent, b: LeaderboardAgent): number {
  return b.xp - a.xp || a.id.localeCompare(b.id)
}

function compareByTasks(a: LeaderboardAgent, b: LeaderboardAgent): number {
  return b.tasksCompleted - a.tasksCompleted || a.id.localeCompare(b.id)
}

export function listLeaderboardAgents(view: LeaderboardView = "global", district?: DistrictId): LeaderboardAgent[] {
  const rows = getAgentRegistry().map(toLeaderboardAgent)

  const global = [...rows].sort(compareByXp)
  global.forEach((row, index) => { row.globalRank = index + 1 })

  for (const districtMeta of DISTRICTS) {
    rows
      .filter((row) => row.district === districtMeta.id)
      .sort(compareByTasks)
      .forEach((row, index) => { row.districtRank = index + 1 })
  }

  const filtered = district ? rows.filter((row) => row.district === district) : rows
  const sorted = [...filtered].sort(view === "global" ? compareByXp : compareByTasks)
  return sorted.map((row, index) => ({ ...row, rank: index + 1, previousRank: index + 1 }))
}

export function getLeaderboardAgent(agentId: string): LeaderboardAgent | undefined {
  return listLeaderboardAgents("global").find((agent) => agent.id === agentId)
}
