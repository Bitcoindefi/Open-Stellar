import { afterEach, describe, expect, it, vi } from "vitest"
import { checkRateLimit, resetRateLimitStore } from "@/lib/rate-limit"

afterEach(() => {
  resetRateLimitStore()
  vi.useRealTimers()
})

describe("sliding window rate limiter", () => {
  it("allows requests up to the limit", () => {
    for (let i = 0; i < 10; i++) {
      const res = checkRateLimit("ip:1.2.3.4", { maxRequests: 10, windowMs: 15_000 })
      expect(res.allowed).toBe(true)
    }
  })

  it("blocks the 11th request in the window", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("ip:1.2.3.4", { maxRequests: 10, windowMs: 15_000 })
    }
    const res = checkRateLimit("ip:1.2.3.4", { maxRequests: 10, windowMs: 15_000 })
    expect(res.allowed).toBe(false)
    expect(res.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it("returns Retry-After seconds until oldest request expires", () => {
    vi.useFakeTimers()
    const config = { maxRequests: 2, windowMs: 10_000 }
    checkRateLimit("ip:1.2.3.4", config)
    vi.advanceTimersByTime(3_000)
    checkRateLimit("ip:1.2.3.4", config)
    const res = checkRateLimit("ip:1.2.3.4", config)
    expect(res.allowed).toBe(false)
    expect(res.retryAfterSeconds).toBe(7)
  })

  it("resets after the window expires", () => {
    vi.useFakeTimers()
    const config = { maxRequests: 1, windowMs: 1_000 }
    checkRateLimit("ip:1.2.3.4", config)
    expect(checkRateLimit("ip:1.2.3.4", config).allowed).toBe(false)
    vi.advanceTimersByTime(1_100)
    expect(checkRateLimit("ip:1.2.3.4", config).allowed).toBe(true)
  })

  it("does not affect different IPs", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("ip:1.2.3.4", { maxRequests: 10, windowMs: 15_000 })
    }
    const res = checkRateLimit("ip:5.6.7.8", { maxRequests: 10, windowMs: 15_000 })
    expect(res.allowed).toBe(true)
  })

  it("uses heartbeat config: 10 req/15s", () => {
    const config = { maxRequests: 10, windowMs: 15_000 }
    for (let i = 0; i < 10; i++) {
      checkRateLimit("heartbeat:1.2.3.4", config)
    }
    expect(checkRateLimit("heartbeat:1.2.3.4", config).allowed).toBe(false)
  })

  it("uses protocol config: 30 req/60s", () => {
    const config = { maxRequests: 30, windowMs: 60_000 }
    for (let i = 0; i < 30; i++) {
      checkRateLimit("protocol:1.2.3.4", config)
    }
    expect(checkRateLimit("protocol:1.2.3.4", config).allowed).toBe(false)
  })
})
