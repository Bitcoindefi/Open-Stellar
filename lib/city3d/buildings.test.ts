import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/lib/data"
import { buildIslandLayouts, isInsideRect, type IslandLayout } from "./layout"
import {
  DISTRICT_SKYLINES,
  PLATFORM_BEVEL,
  buildCityBlocks,
  generateBuildings,
  getBuildingTiers,
  getFreeLots,
  getRoofParts,
  getSkylineStyle,
  getWindowStrips,
  groupParts,
  neonFrame,
  planLots,
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
  const building: BuildingSpec = { x: 1, z: 2, width: 1, depth: 0.8, height: 2.4, hasAntenna: false, setback: 0, roof: "flat" }

  it("adds a strip on all four faces per floor below the roof", () => {
    const strips = getWindowStrips(building, "#22d3ee")
    expect(strips.length).toBeGreaterThan(0)
    expect(strips.length % 4).toBe(0)
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

  it("wraps the narrower setback tier too", () => {
    const stepped = { ...building, height: 4, setback: 0.5 }
    const strips = getWindowStrips(stepped, "#fff")
    const upper = strips.filter((s) => s.y > 2)
    expect(upper.length).toBeGreaterThan(0)
    for (const s of upper.filter((s) => s.sz < 0.1)) expect(s.sx).toBeLessThan(building.width * 0.78)
  })
})

describe("getBuildingTiers and getRoofParts", () => {
  const base: BuildingSpec = { x: 0, z: 0, width: 1, depth: 1, height: 4, hasAntenna: false, setback: 0, roof: "flat" }

  it("stacks a narrower upper tier at the setback", () => {
    expect(getBuildingTiers(base)).toHaveLength(1)
    const tiers = getBuildingTiers({ ...base, setback: 0.6 })
    expect(tiers).toHaveLength(2)
    expect(tiers[0].top).toBeCloseTo(2.4)
    expect(tiers[1].bottom).toBe(tiers[0].top)
    expect(tiers[1].top).toBe(4)
    expect(tiers[1].width).toBeLessThan(tiers[0].width)
  })

  it("tops the building with a cap, a pyramid or nothing", () => {
    expect(getRoofParts(base, "#fff")).toEqual([])
    const [cap] = getRoofParts({ ...base, roof: "cap" }, "#fff")
    expect(cap.y).toBeGreaterThan(4)
    expect(cap.sx).toBeGreaterThan(1)
    const [pyramid] = getRoofParts({ ...base, roof: "pyramid", setback: 0.5 }, "#fff")
    expect(pyramid.shape).toBe("pyramid")
    expect(pyramid.y - pyramid.sy / 2).toBeCloseTo(4)
  })
})

describe("planLots and getFreeLots", () => {
  it("leaves lots by the plaza free and gives props room away from it", () => {
    for (const island of islands) {
      const lots = planLots(island)
      for (const lot of lots) if (lot.nearPlaza) expect(lot.building).toBeNull()
      const free = getFreeLots(island)
      expect(free.length).toBeGreaterThan(0)
      for (const lot of free) {
        expect(lot.building).toBeNull()
        expect(isInsideRect(lot, island.walkArea)).toBe(false)
      }
    }
  })

  it("never puts a mast through a pyramid roof", () => {
    for (const island of islands) {
      for (const b of generateBuildings(island)) if (b.roof === "pyramid") expect(b.hasAntenna).toBe(false)
    }
  })
})

describe("neonFrame", () => {
  const rect = { minX: 0, maxX: 4, minZ: 0, maxZ: 2 }

  it("draws four bars, or eight with cut corners", () => {
    expect(neonFrame(rect, 0, 0.1, "#fff")).toHaveLength(4)
    const cut = neonFrame(rect, 0, 0.1, "#fff", 0.3)
    expect(cut).toHaveLength(8)
    expect(cut[0].sx).toBeCloseTo(3.4)
    expect(cut.slice(4).every((bar) => Math.abs(Math.abs(bar.ry ?? 0) - Math.PI / 4) < 1e-9)).toBe(true)
  })
})

describe("groupParts", () => {
  it("batches by shape, and by blink phase only when asked", () => {
    const parts = [
      { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, color: "#fff" },
      { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, color: "#fff", shape: "cone" as const },
      { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, color: "#fff", blink: 1 as const },
    ]
    expect(groupParts(parts, false).map((b) => b.key)).toEqual(["box:0", "cone:0"])
    const withBlink = groupParts(parts, true)
    expect(withBlink.map((b) => b.key)).toEqual(["box:0", "cone:0", "box:1"])
    expect(withBlink.reduce((n, b) => n + b.parts.length, 0)).toBe(3)
  })
})

describe("buildCityBlocks", () => {
  const blocks = buildCityBlocks(islands)

  it("creates one platform and plaza per island, rimmed in the district color along the bevel", () => {
    expect(blocks.platforms).toHaveLength(islands.length)
    expect(blocks.platformTops).toHaveLength(islands.length)
    expect(blocks.plazas).toHaveLength(islands.length)
    expect(blocks.rims).toHaveLength(islands.length * 8)
    expect(blocks.rims.filter((rim) => rim.color === "#22d3ee")).toHaveLength(8)
    for (const rim of blocks.rims) expect(rim.y).toBeCloseTo(-PLATFORM_BEVEL)
    for (const platform of blocks.platforms) expect(platform.y + platform.sy / 2).toBeCloseTo(0)
  })

  it("lifts the platform sides and facades out of the near-black night palette", () => {
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
    }
    for (const platform of blocks.platforms) expect(luminance(platform.color)).toBeGreaterThan(70)
    for (const top of blocks.platformTops) expect(luminance(top)).toBeGreaterThan(70)
    for (const building of blocks.buildings) expect(luminance(building.color)).toBeGreaterThan(55)
  })

  it("lights windows and tops tall buildings with masts and beacons", () => {
    expect(blocks.buildings.length).toBeGreaterThan(islands.length * 8)
    expect(blocks.windows.length).toBeGreaterThan(blocks.buildings.length)
    expect(blocks.masts.length).toBe(blocks.beacons.length)
    expect(blocks.masts.length).toBeGreaterThan(0)
    for (const beacon of blocks.beacons) {
      expect(beacon.y).toBeGreaterThan(1)
      expect(beacon.blink).toBeGreaterThan(0)
    }
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
