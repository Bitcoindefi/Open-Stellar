import { describe, expect, it } from "vitest"
import { DISTRICT_ROBOTS, ROBOT_FRAMES, getRobotColorFilter } from "@/lib/robot-sprites"
import {
  OFFLINE_SPRITE_FILTER,
  SPRITE_WORLD_SCALE,
  getFrameWindow,
  getSpriteFilter,
  getSpriteVariantKey,
  getSpriteWorldSize,
  isFacingLeft,
} from "./sprites"

const nexus = DISTRICT_ROBOTS["data-center"]

describe("getSpriteWorldSize", () => {
  it("keeps the designed proportions and makes Nexus 3.2 units tall", () => {
    const size = getSpriteWorldSize(nexus)
    expect(size.height).toBeCloseTo(3.2)
    expect(size.width / size.height).toBeCloseTo(nexus.frameWidth / nexus.frameHeight)
    for (const set of Object.values(DISTRICT_ROBOTS)) {
      const { height } = getSpriteWorldSize(set)
      expect(height).toBeGreaterThan(2)
      expect(height).toBeLessThanOrEqual(3.2 + 1e-9)
    }
    expect(getSpriteWorldSize({ frameWidth: 10, frameHeight: 20 }, 0.1)).toEqual({ width: 1, height: 2 })
    expect(SPRITE_WORLD_SCALE).toBeGreaterThan(0)
  })
})

describe("getFrameWindow", () => {
  it("picks one cell of the strip", () => {
    expect(getFrameWindow(0, 6)).toEqual({ offsetX: 0, repeatX: 1 / 6 })
    expect(getFrameWindow(2, 6).offsetX).toBeCloseTo(2 / 6)
  })

  it("mirrors the cell for a left-facing robot", () => {
    const cell = getFrameWindow(2, 6, true)
    expect(cell.repeatX).toBeCloseTo(-1 / 6)
    // u = 0 lands on the cell's right edge and u = 1 on its left edge.
    expect(cell.offsetX).toBeCloseTo(3 / 6)
    expect(cell.offsetX + cell.repeatX).toBeCloseTo(2 / 6)
  })

  it("wraps frames and survives bad input", () => {
    expect(getFrameWindow(ROBOT_FRAMES + 1, ROBOT_FRAMES)).toEqual(getFrameWindow(1, ROBOT_FRAMES))
    expect(getFrameWindow(-1, 6)).toEqual(getFrameWindow(5, 6))
    expect(getFrameWindow(Number.NaN, 6)).toEqual(getFrameWindow(0, 6))
    expect(getFrameWindow(3, 0)).toEqual({ offsetX: 0, repeatX: 1 })
    expect(getFrameWindow(3, Number.NaN)).toEqual({ offsetX: 0, repeatX: 1 })
  })
})

describe("getSpriteFilter", () => {
  it("keeps the native art when the agent color matches the robot", () => {
    expect(getSpriteFilter(nexus, { dim: false, color: "#22d3ee", outlineColor: "#22d3ee" })).toBeNull()
    expect(getSpriteFilter(nexus, { dim: false, color: null, skin: "default", outlineColor: "#22d3ee" })).toBeNull()
  })

  it("applies the same hue shift as the 2D map", () => {
    const filter = getSpriteFilter(nexus, { dim: false, color: "#f472b6", outlineColor: "#22d3ee" })
    expect(filter).toBe(getRobotColorFilter(nexus, "#f472b6"))
  })

  it("adds skins after the hue shift", () => {
    const filter = getSpriteFilter(nexus, { dim: false, color: "#f472b6", skin: "neon", outlineColor: "#22d3ee" })
    expect(filter).toMatch(/^hue-rotate\(.+\) drop-shadow/)
  })

  it("grays out offline robots whatever their color", () => {
    expect(getSpriteFilter(nexus, { dim: true, color: "#f472b6", skin: "gold", outlineColor: "#22d3ee" })).toBe(
      OFFLINE_SPRITE_FILTER,
    )
  })
})

describe("getSpriteVariantKey", () => {
  it("is one key per strip and filter", () => {
    expect(getSpriteVariantKey(nexus.sheet, null)).toBe(nexus.sheet)
    expect(getSpriteVariantKey(nexus.sheet, "grayscale(1)")).not.toBe(getSpriteVariantKey(nexus.sheet, null))
  })
})

describe("isFacingLeft", () => {
  // Camera looking down -z: screen right is world +x.
  const right = { x: 1, z: 0 }

  it("faces the way the robot walks across the screen", () => {
    expect(isFacingLeft(1, 0, right.x, right.z, true)).toBe(false)
    expect(isFacingLeft(-1, 0.2, right.x, right.z, false)).toBe(true)
  })

  it("keeps its side when walking toward or away from the camera", () => {
    expect(isFacingLeft(0.05, 1, right.x, right.z, true)).toBe(true)
    expect(isFacingLeft(-0.05, -1, right.x, right.z, false)).toBe(false)
  })

  it("follows the camera when it orbits", () => {
    // Camera turned 180 degrees: screen right is world -x.
    expect(isFacingLeft(1, 0, -1, 0, false)).toBe(true)
  })

  it("keeps its side for degenerate input", () => {
    expect(isFacingLeft(0, 0, 1, 0, true)).toBe(true)
    expect(isFacingLeft(1, 0, 0, 0, false)).toBe(false)
    expect(isFacingLeft(Number.NaN, 0, 1, 0, true)).toBe(true)
  })
})
