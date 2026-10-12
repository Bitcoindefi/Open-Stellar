import { describe, expect, it } from "vitest"
import { MAX_DPR, MIN_DPR, getInitialDpr, shouldAntialias, stepDpr } from "./quality"

describe("getInitialDpr", () => {
  it("caps dense screens at 1.5", () => {
    expect(getInitialDpr(3)).toBe(MAX_DPR)
    expect(getInitialDpr(2)).toBe(1.5)
  })

  it("keeps regular screens as they are", () => {
    expect(getInitialDpr(1)).toBe(1)
    expect(getInitialDpr(1.25)).toBe(1.25)
  })

  it("treats invalid ratios as 1 and never goes below the floor", () => {
    expect(getInitialDpr(Number.NaN)).toBe(1)
    expect(getInitialDpr(0)).toBe(1)
    expect(getInitialDpr(0.5)).toBe(MIN_DPR)
  })
})

describe("stepDpr", () => {
  it("steps down on decline, never below the floor", () => {
    expect(stepDpr(1.5, -1)).toBe(1.25)
    expect(stepDpr(1, -1)).toBe(0.75)
    expect(stepDpr(0.75, -1)).toBe(MIN_DPR)
  })

  it("steps back up to the device ceiling", () => {
    expect(stepDpr(0.75, 1, 1)).toBe(1)
    expect(stepDpr(1, 1, 1)).toBe(1)
    expect(stepDpr(1.25, 1)).toBe(1.5)
    expect(stepDpr(1.5, 1, 3)).toBe(MAX_DPR)
  })

  it("recovers from an invalid current value", () => {
    expect(stepDpr(Number.NaN, -1)).toBe(0.75)
  })
})

describe("shouldAntialias", () => {
  it("only enables MSAA below 1.5x", () => {
    expect(shouldAntialias(1)).toBe(true)
    expect(shouldAntialias(1.25)).toBe(true)
    expect(shouldAntialias(1.5)).toBe(false)
    expect(shouldAntialias(3)).toBe(false)
    expect(shouldAntialias(Number.NaN)).toBe(true)
  })
})
