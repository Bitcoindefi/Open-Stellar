import { afterEach, describe, expect, it, vi } from "vitest"
import { apiKeyTier, limitForTier, rateLimit, resetRateLimitStore } from "@/lib/auth/rate-limit"
import { blockIp, isIpBlocked, resetBlocklistForTests } from "@/lib/auth/blocklist"

describe("rateLimit", () => {
  afterEach(() => {
    resetRateLimitStore()
    resetBlocklistForTests()
    vi.unstubAllEnvs()
  })

  it("allows requests until the sliding window limit is reached", async () => {
    const first = await rateLimit("ip:1", "/api/test", { maxRequests: 2, windowMs: 60_000 }, 1_000)
    const second = await rateLimit("ip:1", "/api/test", { maxRequests: 2, windowMs: 60_000 }, 2_000)
    const third = await rateLimit("ip:1", "/api/test", { maxRequests: 2, windowMs: 60_000 }, 3_000)

    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(1)
    expect(second.allowed).toBe(true)
    expect(second.remaining).toBe(0)
    expect(third.allowed).toBe(false)
    expect(third.retryAfterSeconds).toBe(58)
  })

  it("expires old requests out of the sliding window", async () => {
    await rateLimit("ip:2", "/api/test", { maxRequests: 1, windowMs: 60_000 }, 1_000)
    const result = await rateLimit("ip:2", "/api/test", { maxRequests: 1, windowMs: 60_000 }, 61_001)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it("selects route limits by API-key tier", () => {
    vi.stubEnv("OPEN_STELLAR_PRO_API_KEYS", "pro-key")

    expect(apiKeyTier(null)).toBe("anon")
    expect(apiKeyTier("free-key")).toBe("free")
    expect(apiKeyTier("pro-key")).toBe("pro")
    expect(limitForTier("/api/stellar/balance", "pro")).toBeNull()
    expect(limitForTier("/api/protocol/x402/quote", "anon")?.maxRequests).toBe(10)
  })
})

describe("blocklist", () => {
  afterEach(() => {
    resetBlocklistForTests()
  })

  it("blocks IPs until the TTL expires", async () => {
    const resetAt = await blockIp("203.0.113.1", 60, 1_000)

    await expect(isIpBlocked("203.0.113.1", 2_000)).resolves.toEqual({ blocked: true, resetAt })
    await expect(isIpBlocked("203.0.113.1", 62_000)).resolves.toEqual({ blocked: false, resetAt: 0 })
  })
})
