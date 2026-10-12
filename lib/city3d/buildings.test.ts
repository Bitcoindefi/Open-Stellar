import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/lib/data"
import { buildIslandLayouts, isInsideRect, type IslandLayout } from "./layout"
import {
  DISTRICT_SKYLINES,
  buildCityBlocks,
  generateBuildings,
  getSkylineStyle,
  getWindowStrips,
  type BuildingSpec,
} from "./buildings"

const islands = buildIslandLayouts(DISTRICTS)

describe("getSkylineStyle", () => {
  it("has a style per district and a fallback", () => {
    expect(getSkylineStyle("processing")).toBe(DISTRICT_SKYLINES.processing)
    expect(getSkylineStyle("unknown").maxHeight).toBeGreaterThan(0)
  })
})

describe("generateBuildings", () => {
  it("is deterministic per island", () => {
    expect(generateBuildings(islands[0])).toEqual(generateBuildings(islands[0]))
    expect(generateBuildings(islands[0])).not.toEqual(generateBuildings(islands[1]))
  })

  it("fills each island and keeps the plaza free", () => {
    for (const island of islands) {
      const buildings = generateBuildings(island)
      expect(buildings.length).toBeGreaterThan(8)
      const style = getSkylineStyle(island.id)
      for (const b of buildings) {
        expect(isInsideRect({ x: b.x, z: b.z }, island.walkArea)).toBe(false)
        expect(isInsideRect({ x: b.x, z: b.z }, island.bounds)).toBe(true)
        expect(b.height).toBeGreaterThan(0)
        expect(b.height).toBeLessThanOrEqual(style.maxHeight * 1.2 + 0.01)
        expect(b.width).toBeGreaterThan(0)
        expect(b.depth).toBeGreaterThan(0)
      }
    }
  })

  it("handles an island smaller than one lot", () => {
    const tiny: IslandLayout = {
      ...islands[0],
      id: "comm-hub",
      bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
      walkArea: { minX: 10, maxX: 11, minZ: 10, maxZ: 11 },
    }
    const buildings = generateBuildings(tiny)
    expect(buildings.length).toBeLessThanOrEqual(1)
  })
})

describe("getWindowStrips", () => {
  const building: BuildingSpec = { x: 1, z: 2, width: 1, depth: 0.8, height: 2.4, hasAntenna: false }

  it("adds a front and a side strip per floor below the roof", () => {
    const strips = getWindowStrips(building, "#22d3ee")
    expect(strips.length).toBeGreaterThan(0)
    expect(strips.length % 2).toBe(0)
    for (const strip of strips) {
      expect(strip.y).toBeLessThan(building.height)
      expect(strip.color).toBe("#22d3ee")
    }
    const front = strips[0]
    expect(front.z).toBeGreaterThan(building.z + building.depth / 2)
    const side = strips[1]
    expect(side.x).toBeGreaterThan(building.x + building.width / 2)
  })

  it("adds no strips to a building too short for a floor", () => {
    expect(getWindowStrips({ ...building, height: 0.4 }, "#fff")).toEqual([])
  })
})

describe("buildCityBlocks", () => {
  const blocks = buildCityBlocks(islands)

  it("creates a platform and a plaza per island, and four rims", () => {
    expect(blocks.platforms).toHaveLength(islands.length * 2)
    expect(blocks.rims).toHaveLength(islands.length * 4)
    expect(blocks.rims.filter((rim) => rim.color === "#22d3ee")).toHaveLength(4)
  })

  it("lights windows and tops tall buildings with masts and beacons", () => {
    expect(blocks.buildings.length).toBeGreaterThan(islands.length * 8)
    expect(blocks.windows.length).toBeGreaterThan(blocks.buildings.length)
    expect(blocks.masts.length).toBe(blocks.beacons.length)
    expect(blocks.masts.length).toBeGreaterThan(0)
    for (const beacon of blocks.beacons) expect(beacon.y).toBeGreaterThan(1)
  })

  it("gives every island its own buildings", () => {
    for (const island of islands) {
      const own = blocks.buildings.filter((b) => isInsideRect({ x: b.x, z: b.z }, island.bounds))
      expect(own.length).toBeGreaterThan(8)
    }
  })

  it("is empty without islands", () => {
    const empty = buildCityBlocks([])
    expect(empty.platforms).toEqual([])
    expect(empty.buildings).toEqual([])
  })
})
