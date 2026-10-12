import { describe, expect, it } from "vitest"
import { DISTRICT_ROBOTS } from "@/lib/robot-sprites"
import { ROBOT_MODELS, ROBOT_WORLD_SCALE, getModelHeight, getRobotModel } from "./robot-models"

describe("getRobotModel", () => {
  it("maps every district to the same robot as the 2D sprites", () => {
    for (const [district, set] of Object.entries(DISTRICT_ROBOTS)) {
      expect(getRobotModel(district).id).toBe(set.id)
    }
  })

  it("falls back like the 2D sprites for unknown districts", () => {
    expect(getRobotModel("unknown").id).toBe("nexus")
    expect(getRobotModel(null).id).toBe("nexus")
  })
})

describe("ROBOT_MODELS", () => {
  it("gives every robot a body, an accent and a glowing visor", () => {
    for (const model of Object.values(ROBOT_MODELS)) {
      const tones = new Set(model.boxes.map((b) => b.tone))
      expect(tones).toEqual(new Set(["shell", "dark", "accent", "glow"]))
      for (const b of model.boxes) {
        expect(b.size.every((v) => v > 0)).toBe(true)
        // Feet on the ground: nothing pokes below y = 0.
        expect(b.position[1] - b.size[1] / 2).toBeGreaterThanOrEqual(-1e-9)
      }
    }
  })

  it("keeps robots about the same size, with designed differences", () => {
    const heights = Object.values(ROBOT_MODELS).map(getModelHeight)
    for (const h of heights) {
      expect(h).toBeGreaterThan(1)
      expect(h).toBeLessThan(1.6)
    }
    expect(ROBOT_WORLD_SCALE).toBeGreaterThan(0)
  })

  it("measures the top of the highest box", () => {
    expect(getModelHeight({ boxes: [] })).toBe(0)
    expect(getModelHeight({ boxes: [{ tone: "shell", size: [1, 2, 1], position: [0, 1, 0] }] })).toBe(2)
  })
})
