import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/lib/data"
import { buildIslandLayouts, isInsideRect } from "./layout"
import { LANE_COLOR, PLATE_EDGE, PLATE_TONES, ROAD_COLOR, SHORE_TONES } from "./palette"
import {
  PLATE_MARGIN,
  PLATE_TOP,
  ROAD_WIDTH,
  SHORE_RINGS,
  WATER_Y,
  WAVE_AMPLITUDE,
  WAVE_GLSL,
  buildGridFacets,
  buildShoreFacets,
  buildStreets,
  expandRect,
  facetNoise,
  getGroundLayout,
  getHarborLayout,
  getIslandsExtent,
  getLaneDashes,
  getRectFrame,
  harborPoint,
  isPlateInsideHarbor,
  shoreHeight,
  srgbToLinear,
  waveHeight,
} from "./terrain"

const islands = buildIslandLayouts(DISTRICTS)

describe("getIslandsExtent", () => {
  it("wraps every island top", () => {
    const extent = getIslandsExtent(islands)
    expect(extent).not.toBeNull()
    for (const island of islands) {
      expect(isInsideRect({ x: island.bounds.minX, z: island.bounds.minZ }, extent!)).toBe(true)
      expect(isInsideRect({ x: island.bounds.maxX, z: island.bounds.maxZ }, extent!)).toBe(true)
    }
    expect(getIslandsExtent([])).toBeNull()
  })
})

describe("getGroundLayout and getHarborLayout", () => {
  const ground = getGroundLayout(islands)
  const harbor = getHarborLayout(ground)

  it("puts a street plate under the city", () => {
    expect(ground.plate).toEqual(expandRect(getIslandsExtent(islands)!, PLATE_MARGIN))
    expect(ground.center.x).toBeCloseTo((ground.plate.minX + ground.plate.maxX) / 2)
  })

  it("keeps the whole plate inside the water, never on the shore", () => {
    expect(isPlateInsideHarbor(ground, harbor)).toBe(true)
    // A harbor that barely wraps the plate would put its corners on land.
    expect(isPlateInsideHarbor(ground, { ...harbor, rx: 1, rz: 1 })).toBe(false)
  })

  it("still lays out a small ground without islands", () => {
    const empty = getGroundLayout([])
    expect(empty.center).toEqual({ x: 0, z: 0 })
    expect(getHarborLayout(empty).rx).toBeGreaterThan(1)
  })

  it("places harbor points on the scaled ellipse", () => {
    const p = harborPoint(harbor, 0, 2)
    expect(p.x).toBeCloseTo(harbor.center.x + harbor.rx * 2)
    expect(p.z).toBeCloseTo(harbor.center.z)
  })
})

describe("facetNoise", () => {
  it("is deterministic and stays in [-1, 1]", () => {
    expect(facetNoise(3, 7, 1)).toBe(facetNoise(3, 7, 1))
    expect(facetNoise(3, 7, 1)).not.toBe(facetNoise(4, 7, 1))
    for (let i = 0; i < 200; i++) {
      const n = facetNoise(i, i * 3 - 50, 9)
      expect(n).toBeGreaterThanOrEqual(-1)
      expect(n).toBeLessThanOrEqual(1)
    }
  })
})

describe("waveHeight", () => {
  it("stays within the wave amplitude", () => {
    for (let i = 0; i < 100; i++) {
      expect(Math.abs(waveHeight(i * 0.7, i * -1.3, i * 0.21))).toBeLessThanOrEqual(WAVE_AMPLITUDE + 1e-9)
    }
  })

  it("keeps the waves below the plate top", () => {
    expect(WATER_Y + WAVE_AMPLITUDE).toBeLessThan(PLATE_TOP)
  })

  it("has a GLSL twin that uses the same constants", () => {
    expect(WAVE_GLSL).toContain(WAVE_AMPLITUDE.toFixed(3))
    expect(WAVE_GLSL).toContain("uTime")
  })
})

describe("buildGridFacets", () => {
  const rect = { minX: 0, maxX: 4, minZ: 0, maxZ: 2 }
  const mesh = buildGridFacets(rect, 1, -0.6, PLATE_TONES)

  it("lays two flat, upward facets per cell at the given height", () => {
    expect(mesh.triangles).toBe(4 * 2 * 2)
    expect(mesh.positions.length).toBe(mesh.triangles * 9)
    expect(mesh.colors.length).toBe(mesh.positions.length)
    for (let i = 1; i < mesh.positions.length; i += 3) expect(mesh.positions[i]).toBeCloseTo(-0.6)
    // Cross product of the first triangle's edges points up (+y).
    const p = mesh.positions
    const ux = p[3] - p[0]
    const uz = p[5] - p[2]
    const vx = p[6] - p[0]
    const vz = p[8] - p[2]
    expect(uz * vx - ux * vz).toBeGreaterThan(0)
  })

  it("gives the three corners of a facet one color, in linear 0-1", () => {
    const c = mesh.colors
    expect(c[0]).toBe(c[3])
    expect(c[0]).toBe(c[6])
    for (const v of c) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe("buildShoreFacets", () => {
  const harbor = getHarborLayout(getGroundLayout(islands))
  const segments = 12
  const mesh = buildShoreFacets(harbor, SHORE_TONES, 5, segments)

  it("closes rings of facets around the harbor", () => {
    expect(mesh.triangles).toBe((SHORE_RINGS.length - 1) * segments * 2)
  })

  it("faces every facet up", () => {
    const p = mesh.positions
    for (let t = 0; t < mesh.triangles; t++) {
      const o = t * 9
      const ux = p[o + 3] - p[o]
      const uy = p[o + 4] - p[o + 1]
      const uz = p[o + 5] - p[o + 2]
      const vx = p[o + 6] - p[o]
      const vy = p[o + 7] - p[o + 1]
      const vz = p[o + 8] - p[o + 2]
      const ny = uz * vx - ux * vz
      expect(ny, `facet ${t}`).toBeGreaterThan(0)
      expect(Math.abs(ny)).toBeGreaterThan(Math.abs(uy * vz - uz * vy) * 0.2)
    }
  })

  it("starts under the water and rises above it", () => {
    expect(shoreHeight(0, 0)).toBeLessThan(WATER_Y)
    expect(shoreHeight(1, 0)).toBeGreaterThan(WATER_Y)
    expect(shoreHeight(4, 0)).toBeGreaterThan(WATER_Y)
  })
})

describe("srgbToLinear", () => {
  it("maps the ends and darkens the mid tones", () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(srgbToLinear(255)).toBeCloseTo(1)
    expect(srgbToLinear(128)).toBeLessThan(0.5)
  })
})

describe("getLaneDashes", () => {
  it("spaces equal dashes along all four edges", () => {
    const rect = { minX: 0, maxX: 10, minZ: 0, maxZ: 4 }
    const dashes = getLaneDashes(rect, 0, 0.5, 0.5)
    const top = dashes.filter((d) => d.z === rect.minZ)
    expect(top.length).toBe(10)
    for (const dash of dashes) {
      expect(dash.color).toBe(LANE_COLOR)
      expect(dash.x).toBeGreaterThanOrEqual(rect.minX)
      expect(dash.x).toBeLessThanOrEqual(rect.maxX)
    }
    expect(getLaneDashes({ minX: 0, maxX: 0.1, minZ: 0, maxZ: 0.1 }, 0)).toEqual([])
  })
})

describe("getRectFrame and buildStreets", () => {
  it("outlines a rectangle with a band that stays inside it", () => {
    const frame = getRectFrame({ minX: 0, maxX: 6, minZ: 0, maxZ: 4 }, 0, 1, 0.1, "#fff")
    expect(frame).toHaveLength(4)
    expect(frame[0].z).toBeCloseTo(0.5)
    expect(frame[2].sz).toBeCloseTo(2)
  })

  it("rings every island with a road and a dashed lane, and edges the plate", () => {
    const ground = getGroundLayout(islands)
    const streets = buildStreets(islands, ground)
    expect(streets.roads).toHaveLength(islands.length * 4)
    for (const road of streets.roads) expect(road.color).toBe(ROAD_COLOR)
    expect(streets.lanes.length).toBeGreaterThan(islands.length * 20)
    for (const lane of streets.lanes) expect(lane.y).toBeGreaterThan(streets.roads[0].y)
    expect(streets.edges.every((edge) => edge.color === PLATE_EDGE)).toBe(true)
    const road = expandRect(islands[0].bounds, ROAD_WIDTH)
    expect(streets.roads[0].sx).toBeCloseTo(road.maxX - road.minX)
  })
})
