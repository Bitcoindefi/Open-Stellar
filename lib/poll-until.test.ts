import { describe, expect, it, vi } from "vitest"
import { pollUntil } from "@/lib/poll-until"

function fakeClock() {
  let t = 0
  return { now: () => t, sleep: vi.fn(async (ms: number) => { t += ms }) }
}

describe("pollUntil", () => {
  it("retries until the attempt returns a value", async () => {
    const clock = fakeClock()
    const attempt = vi.fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ total: 2 })
    expect(await pollUntil(attempt, { intervalMs: 5000, timeoutMs: 60_000, ...clock })).toEqual({ total: 2 })
    expect(attempt).toHaveBeenCalledTimes(3)
    expect(clock.sleep).toHaveBeenCalledWith(5000)
  })

  it("gives up after the timeout", async () => {
    const clock = fakeClock()
    const attempt = vi.fn(async () => null)
    expect(await pollUntil(attempt, { intervalMs: 5000, timeoutMs: 60_000, ...clock })).toBeNull()
    expect(attempt).toHaveBeenCalledTimes(12)
  })

  it("stops when cancelled, before or after a wait", async () => {
    const clock = fakeClock()
    const attempt = vi.fn(async () => null)
    expect(await pollUntil(attempt, { intervalMs: 5000, timeoutMs: 60_000, isCancelled: () => true, ...clock })).toBeNull()
    expect(attempt).not.toHaveBeenCalled()

    let cancelled = false
    const sleep = vi.fn(async () => { cancelled = true })
    expect(await pollUntil(attempt, { intervalMs: 5000, timeoutMs: 60_000, isCancelled: () => cancelled, sleep, now: clock.now })).toBeNull()
    expect(attempt).not.toHaveBeenCalled()
  })

  it("uses real timers by default", async () => {
    vi.useFakeTimers()
    try {
      const promise = pollUntil(async () => "ok", { intervalMs: 10, timeoutMs: 1000 })
      await vi.advanceTimersByTimeAsync(10)
      expect(await promise).toBe("ok")
    } finally {
      vi.useRealTimers()
    }
  })
})
