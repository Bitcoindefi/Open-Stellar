import { DISTRICTS } from "@/lib/data"
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

export function listLeaderboardAgents(view: LeaderboardView = "global", district?: DistrictId): LeaderboardAgent[] {
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
  return sorted.map((row, index) => ({ ...row, rank: index + 1, previousRank: Math.max(1, index + 1 + ((index % 3) - 1)) }))
}

export function getLeaderboardAgent(agentId: string): LeaderboardAgent | undefined {
  return listLeaderboardAgents("global").find((agent) => agent.id === agentId)
}
