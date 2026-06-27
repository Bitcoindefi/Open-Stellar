import type { NotificationRecord } from "@/lib/notifications/notification-store"
import type { QuestLeaderboardEntry } from "./leaderboard-cache"
import {
  getCachedLeaderboard,
  setCachedLeaderboard,
  invalidateLeaderboardCache,
  getCacheStatus,
} from "./leaderboard-cache"

export type LeaderboardPeriod = "daily" | "weekly"

export { invalidateLeaderboardCache, getCacheStatus }
export { resetLeaderboardCache } from "./leaderboard-cache"
export type { QuestLeaderboardEntry } from "./leaderboard-cache"

function getPeriodWindow(period: LeaderboardPeriod, nowMs = Date.now()): { startMs: number; endMs: number } {
  const now = new Date(nowMs)
  const endMs = nowMs

  if (period === "daily") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    return { startMs: start.getTime(), endMs }
  }

  // Weekly: current week starting Monday
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0)
  return { startMs: start.getTime(), endMs }
}

function countQuestCompletions(notifications: NotificationRecord[], startMs: number, endMs: number): number {
  return notifications.filter(
    (n) =>
      n.type === "quest_completed" &&
      new Date(n.createdAt).getTime() >= startMs &&
      new Date(n.createdAt).getTime() <= endMs,
  ).length
}

function estimateXpFromQuests(count: number): number {
  // Rough XP estimate: base 50 XP per quest + 10 XP bonus per quest for streaks
  return count * 60
}

/**
 * Compute the raw leaderboard from notification store.
 * This is the expensive operation we want to cache.
 */
function computeQuestLeaderboard(
  period: LeaderboardPeriod = "weekly",
  nowMs = Date.now(),
): QuestLeaderboardEntry[] {
  const { startMs, endMs } = getPeriodWindow(period, nowMs)

  // Access the global notification store directly (same pattern as notification-store.ts)
  const globalNotifications = globalThis as typeof globalThis & {
    __notificationStore__?: Map<string, NotificationRecord[]>
  }
  const store = globalNotifications.__notificationStore__ ?? new Map()

  const entries: QuestLeaderboardEntry[] = []

  for (const [agentId, notifications] of store.entries()) {
    const questsCompleted = countQuestCompletions(notifications, startMs, endMs)
    if (questsCompleted === 0) continue

    entries.push({
      agentId,
      questsCompleted,
      xpFromQuests: estimateXpFromQuests(questsCompleted),
      rank: 0, // assigned after sort
    })
  }

  // Sort by questsCompleted descending, then by xpFromQuests descending as tie-breaker
  entries.sort((a, b) => {
    if (b.questsCompleted !== a.questsCompleted) {
      return b.questsCompleted - a.questsCompleted
    }
    return b.xpFromQuests - a.xpFromQuests
  })

  // Assign ranks (1-based, dense ranking)
  let currentRank = 1
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].questsCompleted < entries[i - 1].questsCompleted) {
      currentRank = i + 1
    }
    entries[i].rank = currentRank
  }

  // Cap at 20 entries
  return entries.slice(0, 20)
}

/**
 * Build the quest leaderboard with caching.
 * Checks cache first; if fresh, returns cached. Otherwise recomputes and stores.
 */
export function getQuestLeaderboard(
  period: LeaderboardPeriod = "weekly",
  nowMs = Date.now(),
): QuestLeaderboardEntry[] {
  // Check cache
  const cached = getCachedLeaderboard(period, nowMs)
  if (cached) {
    return cached.cached.entries
  }

  // Cache miss or stale — recompute
  const entries = computeQuestLeaderboard(period, nowMs)
  setCachedLeaderboard(period, entries, nowMs)
  return entries
}

/**
 * Get leaderboard stats for a single agent.
 */
export function getAgentQuestStats(
  agentId: string,
  period: LeaderboardPeriod = "weekly",
  nowMs = Date.now(),
): { questsCompleted: number; xpFromQuests: number; rank: number | null } {
  const leaderboard = getQuestLeaderboard(period, nowMs)
  const entry = leaderboard.find((e) => e.agentId === agentId)
  if (!entry) return { questsCompleted: 0, xpFromQuests: 0, rank: null }
  return {
    questsCompleted: entry.questsCompleted,
    xpFromQuests: entry.xpFromQuests,
    rank: entry.rank,
  }
}
