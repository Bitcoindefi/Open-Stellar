import { describe, expect, it, beforeEach } from "vitest"
import {
  setXPMultiplier,
  getActiveMultiplier,
  clearXPMultiplier,
  getXPMultiplierState,
  resetXPMultiplierForTests,
} from "@/lib/gamification/xp-multiplier"

describe("XPMultiplier", () => {
  beforeEach(() => {
    resetXPMultiplierForTests()
  })

  it("returns 1x when no multiplier is set", () => {
    expect(getActiveMultiplier()).toBe(1)
  })

  it("returns the set multiplier while valid", () => {
    setXPMultiplier({ multiplier: 2, validUntil: Date.now() + 60_000, reason: "test" })
    expect(getActiveMultiplier()).toBe(2)
  })

  it("returns 1x after multiplier expires", () => {
    setXPMultiplier({ multiplier: 3, validUntil: Date.now() - 1, reason: "expired" })
    expect(getActiveMultiplier()).toBe(1)
  })

  it("returns 1x after clear", () => {
    setXPMultiplier({ multiplier: 5, validUntil: Date.now() + 60_000, reason: "test" })
    clearXPMultiplier()
    expect(getActiveMultiplier()).toBe(1)
  })

  it("getXPMultiplierState returns null when no multiplier active", () => {
    expect(getXPMultiplierState()).toBeNull()
  })

  it("getXPMultiplierState returns null after expiration", () => {
    setXPMultiplier({ multiplier: 2, validUntil: Date.now() - 1, reason: "expired" })
    expect(getXPMultiplierState()).toBeNull()
  })

  it("getXPMultiplierState returns the multiplier when active", () => {
    setXPMultiplier({ multiplier: 3, validUntil: Date.now() + 60_000, reason: "hackathon" })
    const state = getXPMultiplierState()
    expect(state).not.toBeNull()
    expect(state!.multiplier).toBe(3)
    expect(state!.reason).toBe("hackathon")
  })
})
