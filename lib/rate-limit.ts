const store = new Map<string, number[]>()

const GC_INTERVAL = 60_000
let lastGc = 0

function gc() {
  const now = Date.now()
  if (now - lastGc < GC_INTERVAL) return
  lastGc = now
  for (const [key, timestamps] of store) {
    const latest = timestamps[timestamps.length - 1]
    if (!latest || now - latest > 120_000) {
      store.delete(key)
    }
  }
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; retryAfterSeconds: number } {
  gc()

  const now = Date.now()
  const windowStart = now - config.windowMs

  let timestamps = store.get(key)
  if (!timestamps) {
    timestamps = []
    store.set(key, timestamps)
  }

  while (timestamps.length > 0 && timestamps[0]! < windowStart) {
    timestamps.shift()
  }

  if (timestamps.length >= config.maxRequests) {
    const oldest = timestamps[0]!
    const retryAfter = Math.ceil((oldest + config.windowMs - now) / 1000)
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) }
  }

  timestamps.push(now)
  return { allowed: true, retryAfterSeconds: 0 }
}

export const heartbeatRateLimit: RateLimitConfig = { maxRequests: 10, windowMs: 15_000 }
export const protocolRateLimit: RateLimitConfig = { maxRequests: 30, windowMs: 60_000 }
export const notificationRateLimit: RateLimitConfig = { maxRequests: 20, windowMs: 30_000 }
export const defaultApiRateLimit: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 }

export function resetRateLimitStore() {
  store.clear()
  lastGc = 0
}
