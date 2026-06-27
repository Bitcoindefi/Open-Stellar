// Inline type to avoid circular import with quest-leaderboard.ts
export interface QuestLeaderboardEntry {
  agentId: string
  questsCompleted: number
  xpFromQuests: number
  rank: number
}

export interface CachedLeaderboard {
  entries: QuestLeaderboardEntry[]
  computedAt: number
  weekKey: string
}

export const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// In-memory cache store (global singleton, same pattern as other stores)
const globalCache = globalThis as typeof globalThis & {
  __questLeaderboardCache__?: Map<string, CachedLeaderboard>
}

function getCacheStore(): Map<string, CachedLeaderboard> {
  if (!globalCache.__questLeaderboardCache__) {
    globalCache.__questLeaderboardCache__ = new Map()
  }
  return globalCache.__questLeaderboardCache__
}

/**
 * Generate a week key for cache segmentation.
 * Weekly rankings change every Monday, so we key by ISO week.
 */
function getWeekKey(nowMs = Date.now()): string {
  const now = new Date(nowMs)
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0)
  return monday.toISOString().split("T")[0] // YYYY-MM-DD
}

/**
 * Build a composite cache key from period and week.
 */
function buildCacheKey(period: string, nowMs = Date.now()): string {
  return `${period}:${getWeekKey(nowMs)}`
}

/**
 * Read the cached leaderboard if it exists and is fresh.
 */
export function getCachedLeaderboard(
  period: string,
  nowMs = Date.now(),
): { cached: CachedLeaderboard; ageMs: number } | null {
  const store = getCacheStore()
  const key = buildCacheKey(period, nowMs)
  const entry = store.get(key)

  if (!entry) return null

  const ageMs = nowMs - entry.computedAt
  if (ageMs >= CACHE_TTL_MS) {
    // Stale — treat as miss
    return null
  }

  return { cached: entry, ageMs }
}

/**
 * Store a freshly computed leaderboard in the cache.
 */
export function setCachedLeaderboard(
  period: string,
  entries: QuestLeaderboardEntry[],
  nowMs = Date.now(),
): CachedLeaderboard {
  const store = getCacheStore()
  const weekKey = getWeekKey(nowMs)
  const key = buildCacheKey(period, nowMs)

  const cached: CachedLeaderboard = {
    entries,
    computedAt: nowMs,
    weekKey,
  }

  store.set(key, cached)
  return cached
}

/**
 * Manually invalidate the cache for a given period.
 * Called when quest completion events fire.
 */
export function invalidateLeaderboardCache(period?: string): void {
  const store = getCacheStore()
  if (period) {
    // Invalidate all week keys for this period
    for (const key of store.keys()) {
      if (key.startsWith(`${period}:`)) {
        store.delete(key)
      }
    }
  } else {
    // Invalidate all cached leaderboards (both daily and weekly)
    store.clear()
  }
}

/**
 * Get cache metadata for response headers.
 */
export function getCacheStatus(
  period: string,
  nowMs = Date.now(),
): { hit: boolean; ageMs: number | null } {
  const result = getCachedLeaderboard(period, nowMs)
  if (!result) return { hit: false, ageMs: null }
  return { hit: true, ageMs: result.ageMs }
}

/**
 * Reset cache (useful for testing).
 */
export function resetLeaderboardCache(): void {
  getCacheStore().clear()
}
