import { describe, expect, it } from "vitest"
import { isInsideRect } from "./layout"
import {
  PATH_MARGIN,
  buildWalkPath,
  clampToRect,
  createRng,
  getLoopLength,
  hashString,
  lerpAngle,
  samplePath,
} from "./paths"

const area = { minX: 0, maxX: 8, minZ: 0, maxZ: 5 }

describe("hashString / createRng", () => {
  it("is deterministic and spreads different inputs", () => {
    expect(hashString("bot-0")).toBe(hashString("bot-0"))
    expect(hashString("bot-0")).not.toBe(hashString("bot-1"))
    expect(hashString("")).toBe(0x811c9dc5)
  })

  it("produces repeatable floats in [0, 1)", () => {
    const a = createRng(42)
    const b = createRng(42)
    const values = Array.from({ length: 50 }, () => a())
    expect(values).toEqual(Array.from({ length: 50 }, () => b()))
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(new Set(values).size).toBeGreaterThan(45)
  })
})

describe("clampToRect", () => {
  it("clamps into the rect minus the margin", () => {
    expect(clampToRect({ x: -3, z: 9 }, area, 0.5)).toEqual({ x: 0.5, z: 4.5 })
    expect(clampToRect({ x: 4, z: 2 }, area, 0.5)).toEqual({ x: 4, z: 2 })
  })

  it("collapses to the centre when the margin is wider than the rect", () => {
    expect(clampToRect({ x: 100, z: -100 }, { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, 5)).toEqual({ x: 0.5, z: 0.5 })
  })
})

describe("buildWalkPath", () => {
  it("is stable per agent and different between agents", () => {
    expect(buildWalkPath("bot-3", area)).toEqual(buildWalkPath("bot-3", area))
    expect(buildWalkPath("bot-3", area)).not.toEqual(buildWalkPath("bot-4", area))
  })

  it("keeps every waypoint inside the plaza", () => {
    for (let i = 0; i < 30; i++) {
      const path = buildWalkPath(`bot-${i}`, area, undefined, 5)
      expect(path).toHaveLength(5)
      for (const point of path) expect(isInsideRect(point, area, -PATH_MARGIN + 1e-9)).toBe(true)
    }
  })

  it("starts at the given point, clamped into the plaza", () => {
    const path = buildWalkPath("bot-7", area, { x: 100, z: 2 })
    expect(path[0]).toEqual({ x: area.maxX - PATH_MARGIN, z: 2 })
    expect(path).toHaveLength(4)
  })

  it("needs at least two points", () => {
    expect(buildWalkPath("bot-1", area, undefined, 1)).toHaveLength(2)
  })
})

describe("getLoopLength / samplePath", () => {
  const square = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 2, z: 2 },
    { x: 0, z: 2 },
  ]

  it("measures the closed loop", () => {
    expect(getLoopLength(square)).toBe(8)
    expect(getLoopLength([{ x: 1, z: 1 }])).toBe(0)
    expect(getLoopLength([])).toBe(0)
  })

  it("walks along segments and faces the direction of travel", () => {
    const start = samplePath(square, 0)
    expect(start).toMatchObject({ x: 0, z: 0 })
    expect(start.heading).toBeCloseTo(Math.PI / 2) // toward +x

    const mid = samplePath(square, 3)
    expect(mid.x).toBeCloseTo(2)
    expect(mid.z).toBeCloseTo(1)
    expect(mid.heading).toBeCloseTo(0) // toward +z

    const back = samplePath(square, 5)
    expect(back.x).toBeCloseTo(1)
    expect(back.heading).toBeCloseTo(-Math.PI / 2) // toward -x
  })

  it("wraps around the loop, including negative distances", () => {
    expect(samplePath(square, 9)).toEqual(samplePath(square, 1))
    const before = samplePath(square, -1)
    expect(before.x).toBeCloseTo(0)
    expect(before.z).toBeCloseTo(1)
  })

  it("handles degenerate paths", () => {
    expect(samplePath([], 3)).toEqual({ x: 0, z: 0, heading: 0 })
    expect(samplePath([{ x: 4, z: 5 }], 3)).toEqual({ x: 4, z: 5, heading: 0 })
    expect(samplePath([{ x: 4, z: 5 }, { x: 4, z: 5 }], 3)).toEqual({ x: 4, z: 5, heading: 0 })
    expect(samplePath(square, Number.POSITIVE_INFINITY)).toEqual({ x: 0, z: 0, heading: 0 })
  })

  it("skips zero-length segments", () => {
    const path = [
      { x: 0, z: 0 },
      { x: 0, z: 0 },
      { x: 3, z: 0 },
    ]
    const sample = samplePath(path, 1)
    expect(sample.x).toBeCloseTo(1)
    expect(sample.heading).toBeCloseTo(Math.PI / 2)
  })
})

describe("lerpAngle", () => {
  it("turns the short way round", () => {
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4)
    // From just below +PI to just above -PI is a small step, not a full turn.
    const from = Math.PI - 0.1
    const to = -Math.PI + 0.1
    expect(lerpAngle(from, to, 1)).toBeCloseTo(Math.PI + 0.1)
    expect(lerpAngle(to, from, 1)).toBeCloseTo(-Math.PI - 0.1)
  })

  it("clamps the factor", () => {
    expect(lerpAngle(0, 1, 2)).toBeCloseTo(1)
    expect(lerpAngle(0, 1, -1)).toBeCloseTo(0)
  })
})
