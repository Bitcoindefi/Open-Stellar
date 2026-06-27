import { subscribeToSystemEvents, type PublishedSystemEvent } from "@/lib/events/system-events"

export const LEADERBOARD_CACHE_TTL_MS = 5 * 60 * 1000
export const DEFAULT_LEADERBOARD_LIMIT = 25
export const MAX_LEADERBOARD_LIMIT = 100

export interface LeaderboardEntry {
  rank: number
  agentId: string
  xp: number
  since: string
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[]
  total: number
  window: string
  generatedAt: string
}

export type LeaderboardWindow = "all" | "7d" | "30d"

interface XpEventRecord {
  agentId: string
  xpDelta: number
  timestamp: string
  timestampMs: number
}

interface LeaderboardCacheEntry {
  result: LeaderboardResult
  expiresAt: number
}

type XpDb = XpEventRecord[]
type LeaderboardCache = Map<string, LeaderboardCacheEntry>

const globalState = globalThis as typeof globalThis & {
  __openStellarXpEventsDb__?: XpDb
  __openStellarLeaderboardCache__?: LeaderboardCache
}

function getXpDb(): XpDb {
  if (!globalState.__openStellarXpEventsDb__) {
    globalState.__openStellarXpEventsDb__ = []
  }
  return globalState.__openStellarXpEventsDb__
}

function getCache(): LeaderboardCache {
  if (!globalState.__openStellarLeaderboardCache__) {
    globalState.__openStellarLeaderboardCache__ = new Map()
  }
  return globalState.__openStellarLeaderboardCache__
}

function normalizeAgentId(agentId: string): string {
  const trimmed = agentId.trim()
  if (!trimmed) throw new Error("agentId must not be empty")
  return trimmed.slice(0, 200)
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LEADERBOARD_LIMIT
  return Math.min(MAX_LEADERBOARD_LIMIT, Math.floor(parsed))
}

function normalizeWindow(value: unknown): LeaderboardWindow {
  if (value === "7d" || value === "30d") return value
  return "all"
}

function cacheKey(window: LeaderboardWindow, limit: number): string {
  return `${window}:${limit}`
}

function isCacheValid(entry: LeaderboardCacheEntry | undefined): boolean {
  if (!entry) return false
  return Date.now() < entry.expiresAt
}

function invalidateCache(): void {
  const cache = getCache()
  cache.clear()
}

function invalidateCacheForWindow(window: LeaderboardWindow): void {
  const cache = getCache()
  for (const key of cache.keys()) {
    if (key.startsWith(`${window}:`)) {
      cache.delete(key)
    }
  }
}

function getWindowStartMs(window: LeaderboardWindow, nowMs: number): number {
  if (window === "7d") return nowMs - 7 * 24 * 60 * 60 * 1000
  if (window === "30d") return nowMs - 30 * 24 * 60 * 60 * 1000
  return 0
}

function computeLeaderboard(window: LeaderboardWindow, limit: number, nowMs: number): LeaderboardResult {
  const db = getXpDb()
  const windowStartMs = getWindowStartMs(window, nowMs)

  const xpByAgent = new Map<string, { xp: number; firstSeenMs: number }>()

  for (const record of db) {
    if (record.timestampMs < windowStartMs) continue

    const existing = xpByAgent.get(record.agentId)
    if (existing) {
      existing.xp += record.xpDelta
      existing.firstSeenMs = Math.min(existing.firstSeenMs, record.timestampMs)
    } else {
      xpByAgent.set(record.agentId, { xp: record.xpDelta, firstSeenMs: record.timestampMs })
    }
  }

  const sorted = Array.from(xpByAgent.entries())
    .filter(([, data]) => data.xp > 0)
    .sort(([, a], [, b]) => b.xp - a.xp)

  const total = sorted.length
  const entries: LeaderboardEntry[] = sorted.slice(0, limit).map(([agentId, data], index) => ({
    rank: index + 1,
    agentId,
    xp: data.xp,
    since: new Date(data.firstSeenMs).toISOString(),
  }))

  return {
    entries,
    total,
    window,
    generatedAt: new Date(nowMs).toISOString(),
  }
}

export function recordXpEvent(agentId: string, xpDelta: number, timestampMs = Date.now()): void {
  const cleanId = normalizeAgentId(agentId)
  const safeXp = Math.max(0, Math.floor(Number(xpDelta)))
  const safeMs = Number.isFinite(timestampMs) ? Number(timestampMs) : Date.now()

  const db = getXpDb()
  db.push({
    agentId: cleanId,
    xpDelta: safeXp,
    timestamp: new Date(safeMs).toISOString(),
    timestampMs: safeMs,
  })

  // Keep memory bounded — cap at 50k events
  if (db.length > 50_000) {
    db.splice(0, db.length - 50_000)
  }

  // Invalidate all caches since new XP data arrived
  invalidateCache()
}

export function getLeaderboard(
  window: LeaderboardWindow = "all",
  limit: number = DEFAULT_LEADERBOARD_LIMIT,
  nowMs: number = Date.now(),
): LeaderboardResult {
  const safeLimit = normalizeLimit(limit)
  const safeWindow = normalizeWindow(window)
  const cache = getCache()
  const key = cacheKey(safeWindow, safeLimit)
  const cached = cache.get(key)

  if (isCacheValid(cached)) {
    return cached!.result
  }

  const result = computeLeaderboard(safeWindow, safeLimit, nowMs)
  cache.set(key, {
    result,
    expiresAt: nowMs + LEADERBOARD_CACHE_TTL_MS,
  })

  return result
}

export function getLeaderboardByAgentId(agentId: string, window: LeaderboardWindow = "all", nowMs: number = Date.now()): LeaderboardEntry | null {
  const cleanId = normalizeAgentId(agentId)
  const board = getLeaderboard(window, MAX_LEADERBOARD_LIMIT, nowMs)
  return board.entries.find((e) => e.agentId === cleanId) ?? null
}

export function resetXpLeaderboardStore(): void {
  const db = getXpDb()
  db.splice(0, db.length)
  invalidateCache()
}

export function seedXpEvents(events: Array<{ agentId: string; xpDelta: number; timestampMs?: number }>): void {
  for (const e of events) {
    recordXpEvent(e.agentId, e.xpDelta, e.timestampMs ?? Date.now())
  }
}

// Subscribe to agent.xp system events to auto-ingest XP data
let _subscribed = false
export function subscribeToXpEvents(): () => void {
  if (_subscribed) return () => {}
  _subscribed = true

  return subscribeToSystemEvents((event: PublishedSystemEvent) => {
    if (event.type === "agent.xp" && event.agentId && typeof event.xp === "number") {
      const ts = event.occurredAt ? new Date(event.occurredAt).getTime() : Date.now()
      recordXpEvent(event.agentId, event.xp, ts)
    }
  })
}