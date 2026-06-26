import { DISTRICTS } from "@/lib/data"
import type { DistrictId, MoltbotAgent } from "@/lib/types"

export type DistrictChallengeType = "throughput" | "revenue" | "uptime" | "speed" | "skill"

export interface DistrictChallengeDefinition {
  weekMod: number
  type: DistrictChallengeType
  name: string
  metric: string
  scoreLabel: string
  better: "higher" | "lower"
}

export interface DistrictStanding {
  districtId: DistrictId
  districtName: string
  color: string
  score: number
  formattedScore: string
  rank: number
  multiplier: number
  topAgent: {
    id: string
    name: string
    score: number
    formattedScore: string
  } | null
}

export interface DistrictEventReward {
  districtId: DistrictId
  districtName: string
  multiplier: number
  durationHours: number
  description: string
}

export interface ActiveDistrictEvent {
  id: string
  weekIndex: number
  challenge: DistrictChallengeDefinition
  startedAt: string
  endsAt: string
  secondsRemaining: number
  rewards: DistrictEventReward[]
}

export interface DistrictEventHistoryEntry {
  id: string
  weekIndex: number
  challengeName: string
  winningDistrictId: DistrictId
  winningDistrictName: string
  topAgentName: string
  endedAt: string
}

export const DISTRICT_CHALLENGES: DistrictChallengeDefinition[] = [
  { weekMod: 0, type: "throughput", name: "Throughput Race", metric: "Most tasks completed", scoreLabel: "tasks", better: "higher" },
  { weekMod: 1, type: "revenue", name: "Revenue Sprint", metric: "Highest x402 earnings", scoreLabel: "x402", better: "higher" },
  { weekMod: 2, type: "uptime", name: "Uptime Challenge", metric: "Highest aggregate uptime %", scoreLabel: "uptime", better: "higher" },
  { weekMod: 3, type: "speed", name: "Speed Trial", metric: "Lowest average task duration", scoreLabel: "avg duration", better: "lower" },
  { weekMod: 4, type: "skill", name: "Skill Mastery", metric: "Highest average skill level", scoreLabel: "skill avg", better: "higher" },
]

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const EPOCH_START_MS = Date.UTC(2026, 0, 5, 0, 0, 0, 0)

function getWeekBounds(now: Date = new Date()): { weekIndex: number; startedAt: Date; endsAt: Date } {
  const elapsed = Math.max(0, now.getTime() - EPOCH_START_MS)
  const weekIndex = Math.floor(elapsed / WEEK_MS)
  const startedAt = new Date(EPOCH_START_MS + weekIndex * WEEK_MS)
  return { weekIndex, startedAt, endsAt: new Date(startedAt.getTime() + WEEK_MS) }
}

function seededNoise(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function formatScore(challenge: DistrictChallengeDefinition, score: number): string {
  if (challenge.type === "revenue") return `$${score.toFixed(2)}`
  if (challenge.type === "uptime") return `${score.toFixed(1)}%`
  if (challenge.type === "speed") return `${score.toFixed(1)}m`
  if (challenge.type === "skill") return score.toFixed(2)
  return String(Math.round(score))
}

function getAgentScore(agent: MoltbotAgent, challenge: DistrictChallengeDefinition, weekIndex: number): number {
  const noise = seededNoise(`${weekIndex}:${challenge.type}:${agent.id}`)
  switch (challenge.type) {
    case "throughput":
      return agent.tasksCompleted
    case "revenue":
      return agent.tasksCompleted * (0.03 + noise * 0.09)
    case "uptime":
      return agent.status === "offline" ? 0 : 92 + noise * 7.5 - (agent.status === "error" ? 8 : 0)
    case "speed":
      return 4 + noise * 18 + (agent.status === "working" ? -1.5 : 0)
    case "skill":
      return agent.skills.length === 0 ? 0 : agent.skills.reduce((sum, skill) => sum + skill.level, 0) / agent.skills.length
  }
}

export function getActiveDistrictEvent(now: Date = new Date()): ActiveDistrictEvent {
  const bounds = getWeekBounds(now)
  const challenge = DISTRICT_CHALLENGES[bounds.weekIndex % DISTRICT_CHALLENGES.length]
  return {
    id: `district-${bounds.weekIndex}-${challenge.type}`,
    weekIndex: bounds.weekIndex,
    challenge,
    startedAt: bounds.startedAt.toISOString(),
    endsAt: bounds.endsAt.toISOString(),
    secondsRemaining: Math.max(0, Math.floor((bounds.endsAt.getTime() - now.getTime()) / 1000)),
    rewards: [
      { districtId: "data-center", districtName: "Winning district", multiplier: 2, durationHours: 24, description: "2× XP multiplier for all agents" },
      { districtId: "comm-hub", districtName: "Second district", multiplier: 1.5, durationHours: 24, description: "1.5× XP multiplier for all agents" },
    ],
  }
}

export function getDistrictStandings(agents: MoltbotAgent[], now: Date = new Date()): DistrictStanding[] {
  const event = getActiveDistrictEvent(now)
  const standings = DISTRICTS.map((district) => {
    const districtAgents = agents.filter((agent) => agent.district === district.id)
    const scoredAgents = districtAgents.map((agent) => ({ agent, score: getAgentScore(agent, event.challenge, event.weekIndex) }))
    const score = event.challenge.type === "speed"
      ? (scoredAgents.reduce((sum, entry) => sum + entry.score, 0) / Math.max(1, scoredAgents.length))
      : scoredAgents.reduce((sum, entry) => sum + entry.score, 0) / (event.challenge.type === "uptime" || event.challenge.type === "skill" ? Math.max(1, scoredAgents.length) : 1)
    const top = [...scoredAgents].sort((a, b) => event.challenge.better === "lower" ? a.score - b.score : b.score - a.score)[0]

    return { district, score, top }
  }).sort((a, b) => event.challenge.better === "lower" ? a.score - b.score : b.score - a.score)

  return standings.map((entry, index) => ({
    districtId: entry.district.id,
    districtName: entry.district.name,
    color: entry.district.color,
    score: Number(entry.score.toFixed(3)),
    formattedScore: formatScore(event.challenge, entry.score),
    rank: index + 1,
    multiplier: index === 0 ? 2 : index === 1 ? 1.5 : 1,
    topAgent: entry.top ? {
      id: entry.top.agent.id,
      name: entry.top.agent.name,
      score: Number(entry.top.score.toFixed(3)),
      formattedScore: formatScore(event.challenge, entry.top.score),
    } : null,
  }))
}

export function getDistrictEventHistory(agents: MoltbotAgent[], now: Date = new Date(), count = 6): DistrictEventHistoryEntry[] {
  const current = getWeekBounds(now).weekIndex
  return Array.from({ length: count }, (_, offset) => {
    const weekIndex = Math.max(0, current - offset - 1)
    const eventDate = new Date(EPOCH_START_MS + weekIndex * WEEK_MS + WEEK_MS - DAY_MS)
    const standings = getDistrictStandings(agents, eventDate)
    const winner = standings[0]
    const challenge = DISTRICT_CHALLENGES[weekIndex % DISTRICT_CHALLENGES.length]
    return {
      id: `district-${weekIndex}-${challenge.type}`,
      weekIndex,
      challengeName: challenge.name,
      winningDistrictId: winner.districtId,
      winningDistrictName: winner.districtName,
      topAgentName: winner.topAgent?.name ?? "Unassigned",
      endedAt: new Date(EPOCH_START_MS + (weekIndex + 1) * WEEK_MS).toISOString(),
    }
  })
}
