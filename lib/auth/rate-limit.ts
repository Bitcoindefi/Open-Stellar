import { blockIp } from "@/lib/auth/blocklist"

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  limit: number
  retryAfterSeconds: number
}

export type ApiKeyTier = "anon" | "free" | "pro"

export interface RouteLimitConfig {
  anon: RateLimitConfig
  free: RateLimitConfig
  pro: RateLimitConfig | null
}

const MEMORY_WINDOWS = new Map<string, number[]>()
const GC_INTERVAL = 60_000
let lastGc = 0

export const DDOS_LIMIT: RateLimitConfig = { maxRequests: 500, windowMs: 60_000 }
export const DDOS_BLOCK_TTL_SECONDS = 10 * 60

export const ROUTE_LIMITS: Record<string, RouteLimitConfig> = {
  "/api/protocol/x402/quote": {
    anon: { maxRequests: 10, windowMs: 60_000 },
    free: { maxRequests: 60, windowMs: 60_000 },
    pro: { maxRequests: 600, windowMs: 60_000 },
  },
  "/api/protocol/x402/settle": {
    anon: { maxRequests: 5, windowMs: 60_000 },
    free: { maxRequests: 30, windowMs: 60_000 },
    pro: { maxRequests: 300, windowMs: 60_000 },
  },
  "/api/protocol/passport/authorize": {
    anon: { maxRequests: 3, windowMs: 60_000 },
    free: { maxRequests: 20, windowMs: 60_000 },
    pro: { maxRequests: 200, windowMs: 60_000 },
  },
  "/api/stellar/balance": {
    anon: { maxRequests: 20, windowMs: 60_000 },
    free: { maxRequests: 120, windowMs: 60_000 },
    pro: null,
  },
  "/api/orchestrate": {
    anon: { maxRequests: 2, windowMs: 60_000 },
    free: { maxRequests: 10, windowMs: 60_000 },
    pro: { maxRequests: 60, windowMs: 60_000 },
  },
}

export const DEFAULT_ROUTE_LIMIT: RouteLimitConfig = {
  anon: { maxRequests: 60, windowMs: 60_000 },
  free: { maxRequests: 180, windowMs: 60_000 },
  pro: { maxRequests: 900, windowMs: 60_000 },
}

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

async function kvPipeline(commands: unknown[][]): Promise<Array<unknown | null> | null> {
  const config = kvConfig()
  if (!config) return null

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
  })

  if (!response.ok) {
    console.warn("rate_limit_kv_error", { status: response.status })
    return null
  }

  const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>
  if (payload.some((item) => item.error)) {
    console.warn("rate_limit_kv_error", { errors: payload.map((item) => item.error).filter(Boolean) })
    return null
  }
  return payload.map((item) => item.result ?? null)
}

function gc(now: number): void {
  if (now - lastGc < GC_INTERVAL) return
  lastGc = now
  for (const [key, timestamps] of MEMORY_WINDOWS) {
    const latest = timestamps[timestamps.length - 1]
    if (!latest || now - latest > 120_000) MEMORY_WINDOWS.delete(key)
  }
}

function memorySlidingWindow(key: string, config: RateLimitConfig, now: number): RateLimitResult {
  gc(now)
  const windowStart = now - config.windowMs
  const timestamps = MEMORY_WINDOWS.get(key) ?? []
  while (timestamps.length > 0 && timestamps[0]! <= windowStart) timestamps.shift()

  if (timestamps.length >= config.maxRequests) {
    const resetAt = timestamps[0]! + config.windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000))
    MEMORY_WINDOWS.set(key, timestamps)
    return { allowed: false, remaining: 0, resetAt, limit: config.maxRequests, retryAfterSeconds }
  }

  timestamps.push(now)
  MEMORY_WINDOWS.set(key, timestamps)
  const resetAt = (timestamps[0] ?? now) + config.windowMs
  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - timestamps.length),
    resetAt,
    limit: config.maxRequests,
    retryAfterSeconds: 0,
  }
}

export async function rateLimit(
  identifier: string,
  route: string,
  limits: RateLimitConfig,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const key = `rate:${route}:${identifier}`
  const windowStart = now - limits.windowMs
  const kvResults = await kvPipeline([
    ["ZREMRANGEBYSCORE", key, 0, windowStart],
    ["ZADD", key, now, `${now}:${Math.random().toString(36).slice(2)}`],
    ["ZCARD", key],
    ["ZRANGE", key, 0, 0, "WITHSCORES"],
    ["PEXPIRE", key, limits.windowMs],
  ])

  if (!kvResults) return memorySlidingWindow(key, limits, now)

  const count = Number(kvResults[2] ?? 0)
  const range = Array.isArray(kvResults[3]) ? kvResults[3] : []
  const oldest = Number(range[1] ?? now)
  const resetAt = oldest + limits.windowMs
  const allowed = count <= limits.maxRequests
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000))
  return {
    allowed,
    remaining: allowed ? Math.max(0, limits.maxRequests - count) : 0,
    resetAt,
    limit: limits.maxRequests,
    retryAfterSeconds,
  }
}

export function limitsForRoute(route: string): RouteLimitConfig {
  return ROUTE_LIMITS[route] ?? DEFAULT_ROUTE_LIMIT
}

export function limitForTier(route: string, tier: ApiKeyTier): RateLimitConfig | null {
  return limitsForRoute(route)[tier]
}

export function apiKeyTier(apiKey: string | null): ApiKeyTier {
  if (!apiKey) return "anon"
  const proKeys = (process.env.OPEN_STELLAR_PRO_API_KEYS ?? "").split(",").map((key) => key.trim()).filter(Boolean)
  return proKeys.includes(apiKey) ? "pro" : "free"
}

export async function enforceDdosLimit(ip: string, route: string, now: number = Date.now()): Promise<RateLimitResult> {
  const result = await rateLimit(ip, "*", DDOS_LIMIT, now)
  if (!result.allowed) {
    const resetAt = await blockIp(ip, DDOS_BLOCK_TTL_SECONDS, now)
    console.warn("ddos_ip_blocked", { ip, route, resetAt })
  }
  return result
}

export function resetRateLimitStore(): void {
  MEMORY_WINDOWS.clear()
  lastGc = 0
}

export function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; retryAfterSeconds: number } {
  const result = memorySlidingWindow(key, config, Date.now())
  return { allowed: result.allowed, retryAfterSeconds: result.retryAfterSeconds }
}

export const heartbeatRateLimit: RateLimitConfig = { maxRequests: 10, windowMs: 15_000 }
export const protocolRateLimit: RateLimitConfig = { maxRequests: 30, windowMs: 60_000 }
export const notificationRateLimit: RateLimitConfig = { maxRequests: 20, windowMs: 30_000 }
export const defaultApiRateLimit: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 }
