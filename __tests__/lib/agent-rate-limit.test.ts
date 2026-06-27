import { afterEach, describe, expect, it, vi } from "vitest"
import {
  RATE_LIMIT,
  consumeRateLimit,
  getRateLimitStatus,
  resetAgentRateLimitStoreForTests,
} from "@/lib/agents/rate-limit-store"

afterEach(() => {
  resetAgentRateLimitStoreForTests()
  vi.useRealTimers()
})

describe("agent rate limit store", () => {
  it("allows the 100th request", () => {
    for (let i = 0; i < RATE_LIMIT.maxRequests; i += 1) {
      const result = consumeRateLimit("bot-1")
      expect(result.allowed).toBe(true)
    }
  })

  it("blocks the 101st request", () => {
    for (let i = 0; i < RATE_LIMIT.maxRequests; i += 1) {
      consumeRateLimit("bot-1")
    }

    const blocked = consumeRateLimit("bot-1")
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThanOrEqual(1)
  })

  it("slides the window when old requests expire", () => {
    vi.useFakeTimers()

    for (let i = 0; i < RATE_LIMIT.maxRequests; i += 1) {
      consumeRateLimit("bot-1")
    }

    expect(consumeRateLimit("bot-1").allowed).toBe(false)

    vi.advanceTimersByTime(RATE_LIMIT.windowMs + 1)

    expect(consumeRateLimit("bot-1").allowed).toBe(true)
  })

  it("resets visible usage after expiration", () => {
    vi.useFakeTimers()

    consumeRateLimit("bot-1")
    consumeRateLimit("bot-1")

    expect(getRateLimitStatus("bot-1").requestsInWindow).toBe(2)

    vi.advanceTimersByTime(RATE_LIMIT.windowMs + 1)

    expect(getRateLimitStatus("bot-1").requestsInWindow).toBe(0)
  })
})
