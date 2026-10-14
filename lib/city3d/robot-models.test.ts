import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/lib/data"
import {
  ROBOT_MODEL_DISTRICTS,
  ROBOT_RINGS,
  ROBOT_WORLD_HEIGHT,
  getRobotModelUrl,
  headingToward,
  idleSway,
  isGlowMaterialName,
  walkWaddle,
} from "./robot-models"

describe("robot models", () => {
  it("has a model for every district of the city", () => {
    for (const district of DISTRICTS) {
      expect(getRobotModelUrl(district.id)).toBe(`/models/robots/${district.id}.glb`)
    }
    expect(ROBOT_MODEL_DISTRICTS).toHaveLength(DISTRICTS.length)
  })

  it("returns null for unknown districts", () => {
    expect(getRobotModelUrl("harbor")).toBeNull()
    expect(getRobotModelUrl("")).toBeNull()
  })

  it("ships every model as a small binary glTF", () => {
    for (const district of ROBOT_MODEL_DISTRICTS) {
      const file = join(process.cwd(), "public", "models", "robots", `${district}.glb`)
      expect(existsSync(file)).toBe(true)
      const bytes = readFileSync(file)
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("glTF")
      expect(bytes.length).toBeLessThan(150_000)
      // Meshopt compressed, with no textures to fetch.
      const json = bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12))
      expect(json).toContain("EXT_meshopt_compression")
      expect(json).not.toContain('"images"')
    }
  })

  it("recognizes the glow primitives only", () => {
    expect(isGlowMaterialName("glow")).toBe(true)
    expect(isGlowMaterialName("glow-0")).toBe(true)
    expect(isGlowMaterialName("glow-1")).toBe(true)
    expect(isGlowMaterialName("body")).toBe(false)
    expect(isGlowMaterialName("glowing")).toBe(false)
    expect(isGlowMaterialName(undefined)).toBe(false)
  })

  it("keeps rings ordered and robots readable", () => {
    expect(ROBOT_WORLD_HEIGHT).toBeGreaterThan(1)
    expect(ROBOT_RINGS.accent.inner).toBeLessThan(ROBOT_RINGS.accent.outer)
    expect(ROBOT_RINGS.accent.outer).toBeLessThan(ROBOT_RINGS.focus.inner)
    expect(ROBOT_RINGS.focus.inner).toBeLessThan(ROBOT_RINGS.focus.outer)
  })

  it("sways gently and stays finite", () => {
    for (let t = 0; t < 10; t += 0.37) {
      const sway = idleSway(t, 1.2)
      expect(Math.abs(sway.roll)).toBeLessThanOrEqual(0.05)
      expect(Math.abs(sway.yaw)).toBeLessThanOrEqual(0.18)
      expect(Math.abs(walkWaddle(t, 0.4))).toBeLessThanOrEqual(0.06)
    }
    expect(idleSway(Number.NaN)).toEqual({ roll: 0, yaw: 0 })
    expect(walkWaddle(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it("turns a +z facing robot toward a point", () => {
    expect(headingToward({ x: 0, z: 0 }, { x: 0, z: 5 })).toBeCloseTo(0)
    expect(headingToward({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2)
    expect(headingToward({ x: 1, z: 1 }, { x: 1, z: 1 }, 0.3)).toBe(0.3)
    expect(headingToward({ x: 0, z: 0 }, { x: 0, z: 5 }, 0.2)).toBeCloseTo(0.2)
  })
})
