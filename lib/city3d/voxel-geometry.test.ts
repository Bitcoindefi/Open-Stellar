import { afterEach, describe, expect, it } from "vitest"
import { Color } from "three"
import { ROBOT_MODELS } from "./robot-models"
import { buildBoxesGeometry, buildRobotGeometries, disposeRobotGeometries, getRobotGeometries } from "./voxel-geometry"

// A box geometry has 24 vertices (4 per face, flat normals).
const VERTICES_PER_BOX = 24

describe("buildBoxesGeometry", () => {
  it("merges boxes into one geometry", () => {
    const geometry = buildBoxesGeometry([
      { tone: "shell", size: [1, 1, 1], position: [0, 0.5, 0] },
      { tone: "shell", size: [1, 1, 1], position: [2, 0.5, 0] },
    ])
    expect(geometry.attributes.position.count).toBe(VERTICES_PER_BOX * 2)
    expect(geometry.attributes.color).toBeUndefined()
    expect(geometry.boundingSphere).not.toBeNull()
  })

  it("bakes per-box vertex colors", () => {
    const geometry = buildBoxesGeometry(
      [
        { tone: "shell", size: [1, 1, 1], position: [0, 0, 0] },
        { tone: "dark", size: [1, 1, 1], position: [0, 2, 0] },
      ],
      (b) => (b.tone === "shell" ? "#ffffff" : "#000000"),
    )
    const colors = geometry.attributes.color
    expect(colors.count).toBe(VERTICES_PER_BOX * 2)
    const white = new Color("#ffffff")
    expect(colors.getX(0)).toBeCloseTo(white.r)
    expect(colors.getX(VERTICES_PER_BOX)).toBeCloseTo(0)
  })

  it("returns an empty geometry for no boxes", () => {
    expect(buildBoxesGeometry([]).attributes.position).toBeUndefined()
  })
})

describe("robot geometries", () => {
  afterEach(() => {
    disposeRobotGeometries()
  })

  it("splits a robot into body, accent and glow", () => {
    const model = ROBOT_MODELS.halo
    const { body, accent, glow } = buildRobotGeometries(model)
    const count = (tones: string[]) => model.boxes.filter((b) => tones.includes(b.tone)).length
    expect(body.attributes.position.count).toBe(count(["shell", "dark"]) * VERTICES_PER_BOX)
    expect(body.attributes.color).toBeDefined()
    expect(accent.attributes.position.count).toBe(count(["accent"]) * VERTICES_PER_BOX)
    expect(glow.attributes.position.count).toBe(count(["glow"]) * VERTICES_PER_BOX)
  })

  it("caches per robot type until disposed", () => {
    const first = getRobotGeometries(ROBOT_MODELS.bolt)
    expect(getRobotGeometries(ROBOT_MODELS.bolt)).toBe(first)
    expect(getRobotGeometries(ROBOT_MODELS.flux)).not.toBe(first)
    disposeRobotGeometries()
    expect(getRobotGeometries(ROBOT_MODELS.bolt)).not.toBe(first)
  })
})
