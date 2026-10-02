/**
 * Small key/value store for security state that must be shared across serverless instances
 * (payment bindings, review claims, registration quotas).
 *
 * Backend, in order:
 *   1. Upstash Redis REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or the
 *      KV_REST_API_URL + KV_REST_API_TOKEN pair that the Vercel KV integration sets).
 *      Same plain-fetch approach as lib/auth/storage.ts, so no new dependency.
 *   2. In-memory Map kept on globalThis. Fine for tests and local development; in production
 *      it only holds per instance, so configure Redis there.
 *
 * Redis errors are thrown on purpose: callers guarding money must fail closed.
 */

export interface KvStore {
  get(key: string): Promise<string | null>
  /** Sets the value with a TTL. With `onlyIfAbsent`, returns false when the key already exists. */
  set(key: string, value: string, ttlSeconds: number, options?: { onlyIfAbsent?: boolean }): Promise<boolean>
  del(key: string): Promise<void>
  /** Atomically increments a counter; the TTL is set when the counter is created. */
  incr(key: string, ttlSeconds: number): Promise<number>
  decr(key: string): Promise<number>
}

type RedisConfig = { url: string; token: string }

export function getRedisConfig(): RedisConfig | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim()
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null
}

export function createRedisStore(config: RedisConfig, fetchImpl: typeof fetch = fetch): KvStore {
  async function command(args: Array<string | number>): Promise<unknown> {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.map(String)),
      cache: "no-store",
    })
    const data = await response.json().catch(() => null) as { result?: unknown; error?: string } | null
    if (!response.ok || !data || data.error) throw new Error(`KV ${String(args[0])} failed (HTTP ${response.status}).`)
    return data.result ?? null
  }

  return {
    async get(key) {
      const result = await command(["GET", key])
      return typeof result === "string" ? result : null
    },
    async set(key, value, ttlSeconds, options = {}) {
      const args: Array<string | number> = ["SET", key, value, "EX", Math.max(1, Math.ceil(ttlSeconds))]
      if (options.onlyIfAbsent) args.push("NX")
      return (await command(args)) === "OK"
    },
    async del(key) {
      await command(["DEL", key])
    },
    async incr(key, ttlSeconds) {
      const value = Number(await command(["INCR", key]))
      if (value === 1) await command(["EXPIRE", key, Math.max(1, Math.ceil(ttlSeconds))])
      return value
    },
    async decr(key) {
      return Number(await command(["DECR", key]))
    },
  }
}

type Entry = { value: string; expiresAt: number }

export function createMemoryStore(now: () => number = Date.now): KvStore {
  const entries = new Map<string, Entry>()
  const read = (key: string): Entry | null => {
    const entry = entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= now()) {
      entries.delete(key)
      return null
    }
    return entry
  }
  const write = (key: string, value: string, ttlSeconds: number) => {
    entries.set(key, { value, expiresAt: now() + Math.max(1, ttlSeconds) * 1000 })
  }

  return {
    async get(key) {
      return read(key)?.value ?? null
    },
    async set(key, value, ttlSeconds, options = {}) {
      if (options.onlyIfAbsent && read(key)) return false
      write(key, value, ttlSeconds)
      return true
    },
    async del(key) {
      entries.delete(key)
    },
    async incr(key, ttlSeconds) {
      const entry = read(key)
      const value = (entry ? Number(entry.value) : 0) + 1
      if (entry) entry.value = String(value)
      else write(key, String(value), ttlSeconds)
      return value
    },
    async decr(key) {
      const entry = read(key)
      const value = (entry ? Number(entry.value) : 0) - 1
      if (entry) entry.value = String(value)
      else write(key, String(value), 60)
      return value
    },
  }
}

const globalState = globalThis as typeof globalThis & { __agenticCityKvStore__?: KvStore }
let override: KvStore | null = null
let warned = false

export function getKvStore(): KvStore {
  if (override) return override
  const redis = getRedisConfig()
  if (redis) return createRedisStore(redis)
  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true
    console.warn("[agentic-city] Redis is not configured: payment bindings and quotas are kept per instance.")
  }
  globalState.__agenticCityKvStore__ ??= createMemoryStore()
  return globalState.__agenticCityKvStore__
}

/** Test seam: force a store (null restores the default and clears the in-memory one). */
export function setKvStoreForTests(store: KvStore | null) {
  override = store
  if (!store) delete globalState.__agenticCityKvStore__
}
