import type { NotificationRecord } from "@/lib/notifications/notification-store"

export interface QuestLeaderboardEntry {
  agentId: string
  questsCompleted: number
  xpFromQuests: number
  rank: number
}

export type LeaderboardPeriod = "daily" | "weekly"

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
 * Build the quest leaderboard from the global notification store.
 * Reads all agents' quest_completed notifications within the period window.
 * Returns top 20 entries ranked by questsCompleted descending.
 */
export function getQuestLeaderboard(
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