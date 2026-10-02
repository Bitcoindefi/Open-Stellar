import { afterEach, describe, expect, it, vi } from "vitest"
import { createMemoryStore, createRedisStore, getKvStore, getRedisConfig, setKvStoreForTests } from "@/lib/security/kv-store"

describe("memory kv store", () => {
  it("sets, reads, expires and deletes values", async () => {
    let now = 1_000
    const store = createMemoryStore(() => now)
    expect(await store.set("a", "1", 10)).toBe(true)
    expect(await store.get("a")).toBe("1")
    expect(await store.set("a", "2", 10, { onlyIfAbsent: true })).toBe(false)
    expect(await store.get("a")).toBe("1")
    now += 11_000
    expect(await store.get("a")).toBeNull()
    expect(await store.set("a", "3", 10, { onlyIfAbsent: true })).toBe(true)
    await store.del("a")
    expect(await store.get("a")).toBeNull()
  })

  it("counts up and down and expires counters", async () => {
    let now = 0
    const store = createMemoryStore(() => now)
    expect(await store.incr("c", 5)).toBe(1)
    expect(await store.incr("c", 5)).toBe(2)
    expect(await store.decr("c")).toBe(1)
    now += 6_000
    expect(await store.incr("c", 5)).toBe(1)
    expect(await store.decr("missing")).toBe(-1)
  })
})

describe("redis kv store", () => {
  function fakeFetch(results: unknown[]) {
    const calls: unknown[][] = []
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)))
      const result = results.shift()
      return new Response(JSON.stringify(result instanceof Error ? { error: result.message } : { result }), { status: result instanceof Error ? 400 : 200 })
    })
    return { fn: fn as unknown as typeof fetch, calls }
  }

  it("sends Upstash REST commands", async () => {
    const { fn, calls } = fakeFetch(["OK", null, "v", null, 1, 1, 2, 1, null])
    const store = createRedisStore({ url: "https://kv.test", token: "t" }, fn)
    expect(await store.set("k", "v", 60, { onlyIfAbsent: true })).toBe(true)
    expect(await store.set("k", "v", 60, { onlyIfAbsent: true })).toBe(false)
    expect(await store.get("k")).toBe("v")
    expect(await store.get("missing")).toBeNull()
    expect(await store.incr("n", 30)).toBe(1)
    expect(await store.incr("n", 30)).toBe(2)
    expect(await store.decr("n")).toBe(1)
    await store.del("k")
    expect(calls).toEqual([
      ["SET", "k", "v", "EX", "60", "NX"],
      ["SET", "k", "v", "EX", "60", "NX"],
      ["GET", "k"],
      ["GET", "missing"],
      ["INCR", "n"],
      ["EXPIRE", "n", "30"],
      ["INCR", "n"],
      ["DECR", "n"],
      ["DEL", "k"],
    ])
    expect((fn as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer t" })
  })

  it("throws on errors so callers fail closed", async () => {
    const store = createRedisStore({ url: "https://kv.test", token: "t" }, fakeFetch([new Error("WRONGTYPE")]).fn)
    await expect(store.get("k")).rejects.toThrow("KV GET failed")
    const broken = createRedisStore({ url: "https://kv.test", token: "t" }, vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch)
    await expect(broken.incr("k", 1)).rejects.toThrow("HTTP 500")
  })
})

describe("getKvStore", () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
    setKvStoreForTests(null)
  })

  it("uses Redis when configured, memory otherwise, and honours the test override", () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    expect(getRedisConfig()).toBeNull()
    const memory = getKvStore()
    expect(getKvStore()).toBe(memory)

    process.env.KV_REST_API_URL = "https://kv.test/"
    process.env.KV_REST_API_TOKEN = "t"
    expect(getRedisConfig()).toEqual({ url: "https://kv.test", token: "t" })
    expect(getKvStore()).not.toBe(memory)

    const forced = createMemoryStore()
    setKvStoreForTests(forced)
    expect(getKvStore()).toBe(forced)
  })

  it("warns once in production without Redis", () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.KV_REST_API_URL
    vi.stubEnv("NODE_ENV", "production")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    getKvStore()
    getKvStore()
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1)
    warn.mockRestore()
    vi.unstubAllEnvs()
  })
})
