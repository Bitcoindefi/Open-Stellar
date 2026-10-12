import type { DistrictId } from "@/lib/types"
import { ISLAND_HEIGHT, PLAZA_HEIGHT, isInsideRect, type IslandLayout } from "./layout"
import { createRng, hashString } from "./paths"
import { mixHex } from "./colors"

/**
 * Procedural skyline for the 3D city. Everything becomes plain box instances
 * (position, size, color) so the scene draws each family (platforms, rims,
 * buildings, windows, masts, beacons) with one InstancedMesh: six draw calls
 * for the whole city no matter how many buildings there are.
 */

export interface BoxInstance {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  color: string
}

export interface BuildingSpec {
  x: number
  z: number
  width: number
  depth: number
  height: number
  hasAntenna: boolean
}

interface SkylineStyle {
  minHeight: number
  maxHeight: number
  /** Share of free lots that get a building. */
  density: number
  /** Building footprint as a share of the lot. */
  footprint: [number, number]
}

/** Each district gets its own silhouette: server racks, low factories, towers. */
export const DISTRICT_SKYLINES: Record<DistrictId, SkylineStyle> = {
  "data-center": { minHeight: 1.6, maxHeight: 4.6, density: 0.85, footprint: [0.55, 0.75] },
  "comm-hub": { minHeight: 0.9, maxHeight: 3.4, density: 0.7, footprint: [0.5, 0.7] },
  processing: { minHeight: 0.8, maxHeight: 2.4, density: 0.8, footprint: [0.7, 0.9] },
  defense: { minHeight: 1.2, maxHeight: 3.2, density: 0.75, footprint: [0.65, 0.85] },
  research: { minHeight: 1, maxHeight: 4, density: 0.7, footprint: [0.5, 0.72] },
}

const FALLBACK_SKYLINE: SkylineStyle = { minHeight: 1, maxHeight: 3, density: 0.75, footprint: [0.55, 0.8] }

export const LOT_SIZE = 1.5
const LOT_PADDING = 0.3
const PLAZA_CLEARANCE = 0.35
const FLOOR_HEIGHT = 0.55
const WINDOW_STRIP_HEIGHT = 0.11
const WINDOW_STRIP_DEPTH = 0.04

export function getSkylineStyle(id: string): SkylineStyle {
  return Object.prototype.hasOwnProperty.call(DISTRICT_SKYLINES, id)
    ? DISTRICT_SKYLINES[id as DistrictId]
    : FALLBACK_SKYLINE
}

/**
 * Buildings on the lots of an island that are outside the plaza. Lots toward
 * the back of the island grow taller so the skyline frames the plaza.
 */
export function generateBuildings(island: IslandLayout, lotSize = LOT_SIZE): BuildingSpec[] {
  const style = getSkylineStyle(island.id)
  const rng = createRng(hashString(`skyline:${island.id}`))
  const { bounds } = island
  const usableW = bounds.maxX - bounds.minX - LOT_PADDING * 2
  const usableD = bounds.maxZ - bounds.minZ - LOT_PADDING * 2
  const cols = Math.max(1, Math.floor(usableW / lotSize))
  const rows = Math.max(1, Math.floor(usableD / lotSize))
  const lotW = usableW / cols
  const lotD = usableD / rows
  const buildings: BuildingSpec[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = bounds.minX + LOT_PADDING + lotW * (col + 0.5)
      const z = bounds.minZ + LOT_PADDING + lotD * (row + 0.5)
      const lotHalf = Math.max(lotW, lotD) / 2
      // Draw every random number up front so the layout stays stable if a rule changes.
      const roll = rng()
      const fw = style.footprint[0] + rng() * (style.footprint[1] - style.footprint[0])
      const fd = style.footprint[0] + rng() * (style.footprint[1] - style.footprint[0])
      const heightRoll = rng()
      const antennaRoll = rng()
      if (isInsideRect({ x, z }, island.walkArea, lotHalf * 0.6 + PLAZA_CLEARANCE)) continue
      if (roll > style.density) continue
      const backness = rows > 1 ? 1 - row / (rows - 1) : 1
      const base = style.minHeight + Math.pow(heightRoll, 1.4) * (style.maxHeight - style.minHeight)
      const height = Number((base * (0.75 + 0.45 * backness)).toFixed(2))
      buildings.push({
        x,
        z,
        width: Number((lotW * fw).toFixed(3)),
        depth: Number((lotD * fd).toFixed(3)),
        height,
        hasAntenna: height > style.maxHeight * 0.7 && antennaRoll < 0.6,
      })
    }
  }
  return buildings
}

/** Lit window bands on the two faces the default camera sees (front +z and right +x). */
export function getWindowStrips(building: BuildingSpec, color: string): BoxInstance[] {
  const strips: BoxInstance[] = []
  const floors = Math.max(1, Math.floor((building.height - 0.25) / FLOOR_HEIGHT))
  for (let floor = 0; floor < floors; floor++) {
    const y = 0.35 + floor * FLOOR_HEIGHT
    if (y + WINDOW_STRIP_HEIGHT / 2 > building.height - 0.1) break
    strips.push({
      x: building.x,
      y,
      z: building.z + building.depth / 2 + WINDOW_STRIP_DEPTH / 2,
      sx: building.width * 0.78,
      sy: WINDOW_STRIP_HEIGHT,
      sz: WINDOW_STRIP_DEPTH,
      color,
    })
    strips.push({
      x: building.x + building.width / 2 + WINDOW_STRIP_DEPTH / 2,
      y,
      z: building.z,
      sx: WINDOW_STRIP_DEPTH,
      sy: WINDOW_STRIP_HEIGHT,
      sz: building.depth * 0.78,
      color,
    })
  }
  return strips
}

export interface CityBlocks {
  platforms: BoxInstance[]
  rims: BoxInstance[]
  buildings: BoxInstance[]
  windows: BoxInstance[]
  masts: BoxInstance[]
  beacons: BoxInstance[]
}

const BUILDING_SHADES = ["#0f172a", "#111c33", "#14213b", "#172340"]
const RIM_THICKNESS = 0.09

export function buildCityBlocks(islands: readonly IslandLayout[]): CityBlocks {
  const blocks: CityBlocks = { platforms: [], rims: [], buildings: [], windows: [], masts: [], beacons: [] }

  for (const island of islands) {
    const { bounds, walkArea, color } = island
    const rng = createRng(hashString(`windows:${island.id}`))

    blocks.platforms.push({
      x: island.center.x,
      y: -ISLAND_HEIGHT / 2,
      z: island.center.z,
      sx: island.width,
      sy: ISLAND_HEIGHT,
      sz: island.depth,
      color: mixHex(island.baseColor, color, 0.12),
    })
    blocks.platforms.push({
      x: (walkArea.minX + walkArea.maxX) / 2,
      y: PLAZA_HEIGHT / 2,
      z: (walkArea.minZ + walkArea.maxZ) / 2,
      sx: walkArea.maxX - walkArea.minX,
      sy: PLAZA_HEIGHT,
      sz: walkArea.maxZ - walkArea.minZ,
      color: mixHex(island.baseColor, color, 0.28),
    })

    // Glowing edge around the platform top.
    const rimY = RIM_THICKNESS / 2
    blocks.rims.push(
      { x: island.center.x, y: rimY, z: bounds.minZ, sx: island.width, sy: RIM_THICKNESS, sz: RIM_THICKNESS, color },
      { x: island.center.x, y: rimY, z: bounds.maxZ, sx: island.width, sy: RIM_THICKNESS, sz: RIM_THICKNESS, color },
      { x: bounds.minX, y: rimY, z: island.center.z, sx: RIM_THICKNESS, sy: RIM_THICKNESS, sz: island.depth, color },
      { x: bounds.maxX, y: rimY, z: island.center.z, sx: RIM_THICKNESS, sy: RIM_THICKNESS, sz: island.depth, color },
    )

    const buildings = generateBuildings(island)
    buildings.forEach((building, index) => {
      blocks.buildings.push({
        x: building.x,
        y: building.height / 2,
        z: building.z,
        sx: building.width,
        sy: building.height,
        sz: building.depth,
        color: mixHex(BUILDING_SHADES[index % BUILDING_SHADES.length], color, 0.06),
      })
      // Some buildings glow dimmer so the windows do not read as one flat pattern.
      const windowColor = rng() < 0.35 ? mixHex(color, "#0f172a", 0.45) : color
      blocks.windows.push(...getWindowStrips(building, windowColor))
      if (building.hasAntenna) {
        const mastHeight = 0.9
        blocks.masts.push({
          x: building.x,
          y: building.height + mastHeight / 2,
          z: building.z,
          sx: 0.06,
          sy: mastHeight,
          sz: 0.06,
          color: "#334155",
        })
        blocks.beacons.push({
          x: building.x,
          y: building.height + mastHeight + 0.07,
          z: building.z,
          sx: 0.15,
          sy: 0.15,
          sz: 0.15,
          color,
        })
      }
    })
  }
  return blocks
}
