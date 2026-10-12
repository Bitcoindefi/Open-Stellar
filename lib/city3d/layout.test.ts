import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/lib/data"
import {
  CAMERA_DISTANCE_LIMITS,
  ISLAND_INSET,
  LANDSCAPE_AZIMUTH,
  PORTRAIT_AZIMUTH,
  WORLD_SCALE,
  buildIslandLayouts,
  clamp,
  clampTarget,
  findIsland,
  getCityFrame,
  getDefaultView,
  getFitDistance,
  getWalkArea,
  isInsideRect,
  mapToWorld,
  rectCenter,
  scaleCameraDistance,
  sphericalToPosition,
} from "./layout"

const frame = getCityFrame(DISTRICTS)
const islands = buildIslandLayouts(DISTRICTS, frame)

describe("getCityFrame", () => {
  it("centres the 2D map on the world origin", () => {
    // DISTRICTS span x 40..860 and y 60..490.
    expect(frame.originX).toBe(450)
    expect(frame.originY).toBe(275)
    expect(frame.width).toBeCloseTo(820 * WORLD_SCALE)
    expect(frame.depth).toBeCloseTo(430 * WORLD_SCALE)
  })

  it("is an empty frame without districts", () => {
    expect(getCityFrame([])).toEqual({ originX: 0, originY: 0, width: 0, depth: 0 })
  })
})

describe("mapToWorld", () => {
  it("maps pixels to world units around the origin", () => {
    expect(mapToWorld(450, 275, frame)).toEqual({ x: 0, z: 0 })
    const p = mapToWorld(470, 255, frame)
    expect(p.x).toBeCloseTo(1)
    expect(p.z).toBeCloseTo(-1)
  })
})

describe("buildIslandLayouts", () => {
  it("creates one island per district, laid out like the 2D map", () => {
    expect(islands.map((island) => island.id)).toEqual(DISTRICTS.map((d) => d.id))
    const byId = Object.fromEntries(islands.map((island) => [island.id, island]))
    // Top row left to right, bottom row below it.
    expect(byId["data-center"].center.x).toBeLessThan(byId["comm-hub"].center.x)
    expect(byId["comm-hub"].center.x).toBeLessThan(byId.processing.center.x)
    expect(byId.defense.center.z).toBeGreaterThan(byId["data-center"].center.z)
    expect(byId.research.center.x).toBeGreaterThan(byId.defense.center.x)
  })

  it("keeps islands separated by the inset and carries district colors", () => {
    const dc = islands[0]
    expect(dc.width).toBeCloseTo(260 * WORLD_SCALE - ISLAND_INSET * 2)
    expect(dc.depth).toBeCloseTo(200 * WORLD_SCALE - ISLAND_INSET * 2)
    expect(dc.color).toBe("#22d3ee")
    expect(dc.baseColor).toBe("#0e2a30")
    expect(dc.name).toBe("Data Center")
    // Neighbours never touch.
    expect(islands[1].bounds.minX - dc.bounds.maxX).toBeGreaterThan(ISLAND_INSET)
  })

  it("puts the plaza inside the island, toward the front", () => {
    for (const island of islands) {
      const { walkArea, bounds } = island
      expect(walkArea.minX).toBeGreaterThan(bounds.minX)
      expect(walkArea.maxX).toBeLessThan(bounds.maxX)
      expect(walkArea.minZ).toBeGreaterThan(island.center.z - 1)
      expect(walkArea.maxZ).toBeLessThan(bounds.maxZ)
      expect(walkArea.maxX - walkArea.minX).toBeGreaterThan(3)
      expect(walkArea.maxZ - walkArea.minZ).toBeGreaterThan(2)
    }
  })

  it("never builds a degenerate island", () => {
    const [tiny] = buildIslandLayouts([{ id: "research", name: "R", color: "#a78bfa", bgColor: "#1e142a", x: 0, y: 0, w: 4, h: 4 }])
    expect(tiny.width).toBe(1)
    expect(tiny.depth).toBe(1)
  })
})

describe("rect helpers", () => {
  const rect = { minX: 0, maxX: 4, minZ: -2, maxZ: 2 }

  it("finds the centre", () => {
    expect(rectCenter(rect)).toEqual({ x: 2, z: 0 })
  })

  it("tests containment with an optional margin", () => {
    expect(isInsideRect({ x: 1, z: 1 }, rect)).toBe(true)
    expect(isInsideRect({ x: 4.5, z: 0 }, rect)).toBe(false)
    expect(isInsideRect({ x: 4.5, z: 0 }, rect, 1)).toBe(true)
  })

  it("derives the plaza from island bounds", () => {
    const area = getWalkArea({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 })
    expect(area.minX).toBeCloseTo(2)
    expect(area.maxX).toBeCloseTo(8)
    expect(area.minZ).toBeCloseTo(4.2)
    expect(area.maxZ).toBeCloseTo(9.3)
  })
})

describe("findIsland", () => {
  it("finds by id and falls back to the first island", () => {
    expect(findIsland(islands, "research")?.id).toBe("research")
    expect(findIsland(islands, "unknown")?.id).toBe("data-center")
    expect(findIsland([], "research")).toBeUndefined()
  })
})

describe("camera math", () => {
  it("places the camera on a sphere around the target", () => {
    const top = sphericalToPosition(10, 0, 0)
    expect(top.x).toBeCloseTo(0)
    expect(top.y).toBeCloseTo(10)
    expect(top.z).toBeCloseTo(0)
    const front = sphericalToPosition(10, Math.PI / 2, 0, { x: 1, y: 2, z: 3 })
    expect(front.x).toBeCloseTo(1)
    expect(front.y).toBeCloseTo(2)
    expect(front.z).toBeCloseTo(13)
    const side = sphericalToPosition(10, Math.PI / 2, Math.PI / 2)
    expect(side.x).toBeCloseTo(10)
    expect(side.z).toBeCloseTo(0)
  })

  it("backs off further on narrow screens", () => {
    const wide = getFitDistance(frame, 1.6, 0.9, LANDSCAPE_AZIMUTH)
    const narrow = getFitDistance(frame, 0.55, 0.9, LANDSCAPE_AZIMUTH)
    expect(narrow).toBeGreaterThan(wide)
  })

  it("stays inside the distance limits and tolerates a bad aspect", () => {
    // A wide lens on a tiny footprint would come closer than allowed.
    const tiny = getFitDistance({ width: 0.1, depth: 0.1 }, 1, 0.9, 0, 170)
    expect(tiny).toBe(CAMERA_DISTANCE_LIMITS.min)
    const huge = getFitDistance({ width: 1000, depth: 1000 }, 1, 0.9, 0)
    expect(huge).toBe(CAMERA_DISTANCE_LIMITS.max)
    expect(getFitDistance(frame, Number.NaN, 0.9, 0)).toBe(getFitDistance(frame, 1, 0.9, 0))
    expect(getFitDistance(frame, 0, 0.9, 0)).toBe(getFitDistance(frame, 1, 0.9, 0))
  })

  it("turns the city on portrait screens and keeps it framed", () => {
    const landscape = getDefaultView(1.5, frame)
    const portrait = getDefaultView(0.5, frame)
    expect(landscape.azimuth).toBe(LANDSCAPE_AZIMUTH)
    expect(portrait.azimuth).toBe(PORTRAIT_AZIMUTH)
    // Turning the long side into the screen fits a phone better than the landscape angle would.
    expect(portrait.distance).toBeLessThan(getFitDistance(frame, 0.5, portrait.polar, LANDSCAPE_AZIMUTH))
    expect(landscape.target).toEqual({ x: 0, y: 0, z: 0 })
    expect(Math.hypot(landscape.position.x, landscape.position.y, landscape.position.z)).toBeCloseTo(landscape.distance)
  })

  it("zooms along the line of sight within limits", () => {
    const target = { x: 0, y: 0, z: 0 }
    const zoomedIn = scaleCameraDistance({ x: 0, y: 30, z: 40 }, target, 0.5)
    expect(zoomedIn).toEqual({ x: 0, y: 15, z: 20 })
    const clampedIn = scaleCameraDistance({ x: 0, y: 3, z: 4 }, target, 0.1, 2, 100)
    expect(Math.hypot(clampedIn.x, clampedIn.y, clampedIn.z)).toBeCloseTo(2)
    const clampedOut = scaleCameraDistance({ x: 0, y: 30, z: 40 }, target, 10, 2, 100)
    expect(Math.hypot(clampedOut.x, clampedOut.y, clampedOut.z)).toBeCloseTo(100)
  })

  it("ignores invalid zoom input", () => {
    const position = { x: 1, y: 2, z: 3 }
    expect(scaleCameraDistance(position, position, 2)).toEqual(position)
    expect(scaleCameraDistance(position, { x: 0, y: 0, z: 0 }, 0)).toEqual(position)
    expect(scaleCameraDistance(position, { x: 0, y: 0, z: 0 }, Number.NaN)).toEqual(position)
  })

  it("keeps the orbit target over the city", () => {
    expect(clampTarget({ x: 100, y: 5, z: -100 }, { width: 40, depth: 20 }, 2)).toEqual({ x: 22, y: 0, z: -12 })
    expect(clampTarget({ x: 1, y: 0, z: 1 }, { width: 40, depth: 20 })).toEqual({ x: 1, y: 0, z: 1 })
  })

  it("clamps numbers", () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
})
