import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/lib/data"
import { DISTRICT_BACKGROUNDS } from "@/lib/district-backgrounds"
import { buildIslandLayouts, isInsideRect } from "./layout"
import {
  GROUND_MARGIN,
  MAX_GROUND_TEXTURE,
  PLATE_MARGIN,
  expandRect,
  getGroundLayout,
  getGroundTextureSize,
  getIslandArtWindow,
  getIslandsExtent,
  isPlateOpaque,
  rectToTexture,
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

describe("getGroundLayout", () => {
  const layout = getGroundLayout(islands)

  it("puts a street plate under the city and water around it", () => {
    const extent = getIslandsExtent(islands)!
    expect(layout.plate).toEqual(expandRect(extent, PLATE_MARGIN))
    expect(layout.bounds).toEqual(expandRect(layout.plate, GROUND_MARGIN))
    expect(layout.width).toBeCloseTo(layout.bounds.maxX - layout.bounds.minX)
    expect(layout.depth).toBeCloseTo(layout.bounds.maxZ - layout.bounds.minZ)
  })

  it("keeps the whole plate inside the opaque part of the water fade", () => {
    expect(isPlateOpaque(layout)).toBe(true)
    // A ground that barely wraps the plate would fade under the city.
    expect(isPlateOpaque(getGroundLayout(islands, PLATE_MARGIN, 1))).toBe(false)
  })

  it("still lays out a small ground without islands", () => {
    const empty = getGroundLayout([])
    expect(empty.width).toBeGreaterThan(0)
    expect(empty.center).toEqual({ x: 0, z: 0 })
  })
})

describe("getGroundTextureSize", () => {
  it("follows the plane proportions and caps the long side", () => {
    const size = getGroundTextureSize({ width: 40, depth: 20 }, 10)
    expect(size).toEqual({ width: 400, height: 200 })
    const capped = getGroundTextureSize({ width: 1000, depth: 500 }, 10)
    expect(capped.width).toBe(MAX_GROUND_TEXTURE)
    expect(capped.height).toBe(MAX_GROUND_TEXTURE / 2)
    expect(getGroundTextureSize({ width: 0, depth: 0 }, 10)).toEqual({ width: 1, height: 1 })
  })
})

describe("rectToTexture", () => {
  it("maps world x to canvas x and world z down the canvas", () => {
    const layout = { bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 }, width: 20, depth: 10 }
    const px = rectToTexture({ minX: 0, maxX: 5, minZ: -5, maxZ: 0 }, layout, { width: 200, height: 100 })
    expect(px).toEqual({ x: 100, y: 0, width: 50, height: 50 })
  })
})

describe("getIslandArtWindow", () => {
  const ART = { width: 1344, height: 752 }

  it("covers the island without stretching the art", () => {
    for (const island of islands) {
      const art = DISTRICT_BACKGROUNDS[island.id]
      const crop = getIslandArtWindow(island, ART.width, ART.height, art.focusX, art.focusY)
      expect(crop.repeatX).toBeGreaterThan(0)
      expect(crop.repeatY).toBeGreaterThan(0)
      expect(crop.repeatX).toBeLessThanOrEqual(1)
      expect(crop.repeatY).toBeLessThanOrEqual(1)
      expect(crop.offsetX + crop.repeatX).toBeLessThanOrEqual(1 + 1e-9)
      expect(crop.offsetY + crop.repeatY).toBeLessThanOrEqual(1 + 1e-9)
      const shownAspect = (crop.repeatX * ART.width) / (crop.repeatY * ART.height)
      expect(shownAspect).toBeCloseTo(island.width / island.depth, 1)
    }
  })

  it("uses the full height of a wide art on a squarer island, positioned by the focus", () => {
    const island = { width: 10, depth: 10 }
    const left = getIslandArtWindow(island, ART.width, ART.height, 0, 0.5)
    const right = getIslandArtWindow(island, ART.width, ART.height, 1, 0.5)
    expect(left.repeatY).toBe(1)
    expect(left.offsetX).toBe(0)
    expect(right.offsetX + right.repeatX).toBeCloseTo(1)
  })

  it("falls back to the whole image for bad sizes", () => {
    expect(getIslandArtWindow({ width: 0, depth: 4 }, ART.width, ART.height)).toEqual({
      offsetX: 0,
      offsetY: 0,
      repeatX: 1,
      repeatY: 1,
    })
  })
})
