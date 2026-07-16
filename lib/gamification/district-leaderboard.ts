import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { DISTRICTS } from "@/lib/data"
import { formatDistrictScore, getActiveDistrictEvent, getAgentDistrictCompetitionScore, getWeekBounds, getWeeklyTasksCompleted } from "@/lib/gamification/events"
import type { DistrictId, MoltbotAgent } from "@/lib/types"

export interface DistrictLeaderboardEntry {
  rank: number
  agentId: string
  agentName: string
  score: number
  formattedScore: string
  tasksCompletedThisWeek: number
  districtId: DistrictId
  districtName: string
}

export interface DistrictLeaderboardSnapshot {
  weekIndex: number
  districtId: DistrictId
  districtName: string
  endedAt: string
  challengeName: string
  entries: Omit<DistrictLeaderboardEntry, "districtId" | "districtName">[]
}

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "district-leaderboard-snapshots.json")

export function getDistrictLeaderboard(agents: MoltbotAgent[], districtId: DistrictId, now: Date = new Date()): DistrictLeaderboardEntry[] {
  const event = getActiveDistrictEvent(now)
  const district = DISTRICTS.find((entry) => entry.id === districtId)
  const districtName = district?.name ?? districtId

  return agents
    .filter((agent) => agent.district === districtId)
    .map((agent) => {
      const score = getAgentDistrictCompetitionScore(agent, event.challenge, event.weekIndex)
      return {
        rank: 0,
        agentId: agent.id,
        agentName: agent.name,
        score: Number(score.toFixed(3)),
        formattedScore: formatDistrictScore(event.challenge, score),
        tasksCompletedThisWeek: getWeeklyTasksCompleted(agent, event.weekIndex),
        districtId,
        districtName,
      }
    })
    .sort((a, b) => event.challenge.better === "lower" ? a.score - b.score : b.score - a.score)
    .slice(0, 10)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

function isSnapshot(value: unknown): value is DistrictLeaderboardSnapshot {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<DistrictLeaderboardSnapshot>
  return typeof candidate.weekIndex === "number"
    && typeof candidate.districtId === "string"
    && typeof candidate.districtName === "string"
    && typeof candidate.endedAt === "string"
    && typeof candidate.challengeName === "string"
    && Array.isArray(candidate.entries)
}

export function readDistrictLeaderboardSnapshots(): DistrictLeaderboardSnapshot[] {
  if (!existsSync(SNAPSHOT_PATH)) return []
  try {
    const parsed: unknown = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"))
    return Array.isArray(parsed) ? parsed.filter(isSnapshot) : []
  } catch {
    return []
  }
}

export function getPreviousDistrictLeaderboardSnapshot(districtId: DistrictId, now: Date = new Date()): DistrictLeaderboardSnapshot | null {
  const previousWeekIndex = Math.max(0, getWeekBounds(now).weekIndex - 1)
  return readDistrictLeaderboardSnapshots()
    .filter((snapshot) => snapshot.districtId === districtId && snapshot.weekIndex <= previousWeekIndex)
    .sort((a, b) => b.weekIndex - a.weekIndex)[0] ?? null
}
