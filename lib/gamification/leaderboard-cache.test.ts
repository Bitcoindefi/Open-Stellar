import { describe, it, expect, beforeEach } from "vitest"
import {
  getCachedLeaderboard,
  setCachedLeaderboard,
  invalidateLeaderboardCache,
  getCacheStatus,
  resetLeaderboardCache,
  CACHE_TTL_MS,
} from "./leaderboard-cache"
import type { QuestLeaderboardEntry } from "./quest-leaderboard"

beforeEach(() => {
  resetLeaderboardCache()
})

describe("leaderboard-cache", () => {
  it("returns null when cache is empty", () => {
    expect(getCachedLeaderboard("weekly")).toBeNull()
  })

  it("returns cached entry when fresh", () => {
    const entries: QuestLeaderboardEntry[] = [
      { agentId: "agent-1", questsCompleted: 5, xpFromQuests: 300, rank: 1 },
    ]
    setCachedLeaderboard("weekly", entries)

    const result = getCachedLeaderboard("weekly")
    expect(result).not.toBeNull()
    expect(result!.cached.entries).toEqual(entries)
  })

  it("returns null when entry is stale (> 5 minutes)", () => {
    const entries: QuestLeaderboardEntry[] = [
      { agentId: "agent-1", questsCompleted: 5, xpFromQuests: 300, rank: 1 },
    ]
    const now = Date.now()
    setCachedLeaderboard("weekly", entries, now)

    const result = getCachedLeaderboard("weekly", now + CACHE_TTL_MS + 1000)
    expect(result).toBeNull()
  })

  it("clears all cached entries on invalidate", () => {
    setCachedLeaderboard("weekly", [])
    setCachedLeaderboard("daily", [])

    invalidateLeaderboardCache()

    expect(getCachedLeaderboard("weekly")).toBeNull()
    expect(getCachedLeaderboard("daily")).toBeNull()
  })

  it("reports hit=true when cache is fresh", () => {
    setCachedLeaderboard("weekly", [])
    const status = getCacheStatus("weekly")
    expect(status.hit).toBe(true)
    expect(status.ageMs).toBeGreaterThanOrEqual(0)
  })

  it("reports hit=false when cache is empty", () => {
    const status = getCacheStatus("weekly")
    expect(status.hit).toBe(false)
    expect(status.ageMs).toBeNull()
  })

  it("returns HIT on second call within TTL", () => {
    const now = Date.now()
    // First call primes the cache
    setCachedLeaderboard("weekly", [], now)
    // Second call — should be HIT
    const status = getCacheStatus("weekly", now + 1000)
    expect(status.hit).toBe(true)
  })

  it("returns MISS after TTL expires", () => {
    const now = Date.now()
    setCachedLeaderboard("weekly", [], now)
    const status = getCacheStatus("weekly", now + CACHE_TTL_MS + 1000)
    expect(status.hit).toBe(false)
  })
})