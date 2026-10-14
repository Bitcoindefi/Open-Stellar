import type { DistrictId } from "@/lib/types"
import { ISLAND_HEIGHT, PLAZA_HEIGHT, isInsideRect, type IslandLayout, type WorldRect } from "./layout"
import { createRng, hashString } from "./paths"
import { mixHex } from "./colors"
import { FACADE_TONES, ISLAND_TOP, MAST_COLOR, PLAZA_COLOR, ROOF_COLOR } from "./palette"

/**
 * Procedural low-poly districts for the 3D city. Everything becomes plain part
 * instances (shape, position, size, rotation, color) so the scene draws each
 * family with one InstancedMesh, no matter how many buildings there are.
 */

/** Unit primitives the scene instances; every one is centred and 1 unit in each axis. */
export type PartShape = "box" | "cylinder" | "cone" | "pyramid" | "dome" | "dish" | "octahedron"

export interface BoxInstance {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  color: string
  /** Defaults to "box". */
  shape?: PartShape
  /** Euler rotation in radians (XYZ order). */
  rx?: number
  ry?: number
  rz?: number
}

/** Glowing parts can blink in one of two phases; 0 holds steady. */
export type BlinkPhase = 0 | 1 | 2

export interface GlowInstance extends BoxInstance {
  blink?: BlinkPhase
}

export type RoofKind = "flat" | "cap" | "pyramid"

export interface BuildingSpec {
  x: number
  z: number
  width: number
  depth: number
  height: number
  hasAntenna: boolean
  /** Share of the height where a narrower upper tier starts (0 = a single block). */
  setback: number
  roof: RoofKind
}

interface SkylineStyle {
  minHeight: number
  maxHeight: number
  /** Share of free lots that get a building. */
  density: number
  /** Building footprint as a share of the lot. */
  footprint: [number, number]
  /** Chance of a setback upper tier and of a pyramid roof. */
  setbackChance: number
  pyramidChance: number
}

/** Each district gets its own silhouette: server blocks, low antennas, factories, bunkers, labs. */
export const DISTRICT_SKYLINES: Record<DistrictId, SkylineStyle> = {
  "data-center": { minHeight: 1.6, maxHeight: 4.6, density: 0.85, footprint: [0.55, 0.75], setbackChance: 0.5, pyramidChance: 0.1 },
  "comm-hub": { minHeight: 0.9, maxHeight: 3.4, density: 0.7, footprint: [0.5, 0.7], setbackChance: 0.45, pyramidChance: 0.35 },
  processing: { minHeight: 0.8, maxHeight: 2.4, density: 0.8, footprint: [0.7, 0.9], setbackChance: 0.2, pyramidChance: 0.4 },
  defense: { minHeight: 1.2, maxHeight: 3.2, density: 0.75, footprint: [0.65, 0.85], setbackChance: 0.35, pyramidChance: 0.15 },
  research: { minHeight: 1, maxHeight: 4, density: 0.7, footprint: [0.5, 0.72], setbackChance: 0.55, pyramidChance: 0.3 },
}

const FALLBACK_SKYLINE: SkylineStyle = {
  minHeight: 1,
  maxHeight: 3,
  density: 0.75,
  footprint: [0.55, 0.8],
  setbackChance: 0.4,
  pyramidChance: 0.2,
}

export const LOT_SIZE = 1.5
const LOT_PADDING = 0.3
const PLAZA_CLEARANCE = 0.35
/** Props may stand this close to the plaza (their own half size included). */
const PROP_CLEARANCE = 0.55
const FLOOR_HEIGHT = 0.55
const WINDOW_STRIP_HEIGHT = 0.11
const WINDOW_STRIP_DEPTH = 0.04
/** Upper tier footprint as a share of the lower one. */
const SETBACK_SHRINK = 0.66
const CAP_HEIGHT = 0.08
const PYRAMID_HEIGHT = 0.55

export function getSkylineStyle(id: string): SkylineStyle {
  return Object.prototype.hasOwnProperty.call(DISTRICT_SKYLINES, id)
    ? DISTRICT_SKYLINES[id as DistrictId]
    : FALLBACK_SKYLINE
}

export interface Lot {
  x: number
  z: number
  width: number
  depth: number
  /** The building on this lot, if any. */
  building: BuildingSpec | null
  /** Whether the lot overlaps the plaza clearance (no building there). */
  nearPlaza: boolean
}

/**
 * Splits an island into lots and decides which ones get a building. Lots
 * toward the back of the island grow taller so the skyline frames the plaza.
 */
export function planLots(island: IslandLayout, lotSize = LOT_SIZE): Lot[] {
  const style = getSkylineStyle(island.id)
  const rng = createRng(hashString(`skyline:${island.id}`))
  const { bounds } = island
  const usableW = bounds.maxX - bounds.minX - LOT_PADDING * 2
  const usableD = bounds.maxZ - bounds.minZ - LOT_PADDING * 2
  const cols = Math.max(1, Math.floor(usableW / lotSize))
  const rows = Math.max(1, Math.floor(usableD / lotSize))
  const lotW = usableW / cols
  const lotD = usableD / rows
  const lots: Lot[] = []

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
      const setbackRoll = rng()
      const roofRoll = rng()
      const nearPlaza = isInsideRect({ x, z }, island.walkArea, lotHalf * 0.6 + PLAZA_CLEARANCE)
      let building: BuildingSpec | null = null
      if (!nearPlaza && roll <= style.density) {
        const backness = rows > 1 ? 1 - row / (rows - 1) : 1
        const base = style.minHeight + Math.pow(heightRoll, 1.4) * (style.maxHeight - style.minHeight)
        const height = Number((base * (0.75 + 0.45 * backness)).toFixed(2))
        const tall = height > style.maxHeight * 0.55
        building = {
          x,
          z,
          width: Number((lotW * fw).toFixed(3)),
          depth: Number((lotD * fd).toFixed(3)),
          height,
          hasAntenna: height > style.maxHeight * 0.7 && antennaRoll < 0.6,
          setback: tall && setbackRoll < style.setbackChance ? 0.55 + setbackRoll * 0.25 : 0,
          roof: roofRoll < style.pyramidChance ? "pyramid" : roofRoll < style.pyramidChance + 0.45 ? "cap" : "flat",
        }
        // A pyramid already tops the building; no mast through it.
        if (building.roof === "pyramid") building.hasAntenna = false
      }
      lots.push({ x, z, width: lotW, depth: lotD, building, nearPlaza })
    }
  }
  return lots
}

export function generateBuildings(island: IslandLayout, lotSize = LOT_SIZE): BuildingSpec[] {
  return planLots(island, lotSize).flatMap((lot) => (lot.building ? [lot.building] : []))
}

/**
 * Empty lots where a prop fits without touching the plaza robots walk on,
 * nearest to the plaza first (that is where the camera looks).
 */
export function getFreeLots(island: IslandLayout, lotSize = LOT_SIZE): Lot[] {
  const center = { x: (island.walkArea.minX + island.walkArea.maxX) / 2, z: (island.walkArea.minZ + island.walkArea.maxZ) / 2 }
  return planLots(island, lotSize)
    .filter((lot) => !lot.building && !isInsideRect(lot, island.walkArea, PROP_CLEARANCE))
    .sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z))
}

export interface Tier {
  x: number
  z: number
  width: number
  depth: number
  bottom: number
  top: number
}

/** The one or two stacked blocks of a building (lower block, then the setback tier). */
export function getBuildingTiers(building: BuildingSpec): Tier[] {
  const { x, z, width, depth, height, setback } = building
  if (setback <= 0) return [{ x, z, width, depth, bottom: 0, top: height }]
  const split = Number((height * setback).toFixed(3))
  return [
    { x, z, width, depth, bottom: 0, top: split },
    { x, z, width: width * SETBACK_SHRINK, depth: depth * SETBACK_SHRINK, bottom: split, top: height },
  ]
}

/** Lit window bands on all four faces of every tier, one per floor. */
export function getWindowStrips(building: BuildingSpec, color: string): BoxInstance[] {
  const strips: BoxInstance[] = []
  for (const tier of getBuildingTiers(building)) {
    const span = tier.top - tier.bottom
    const floors = Math.max(0, Math.floor((span - 0.25) / FLOOR_HEIGHT))
    for (let floor = 0; floor < floors; floor++) {
      const y = tier.bottom + 0.35 + floor * FLOOR_HEIGHT
      if (y + WINDOW_STRIP_HEIGHT / 2 > tier.top - 0.1) break
      const fx = tier.width * 0.78
      const fz = tier.depth * 0.78
      const hz = tier.depth / 2 + WINDOW_STRIP_DEPTH / 2
      const hx = tier.width / 2 + WINDOW_STRIP_DEPTH / 2
      strips.push(
        { x: tier.x, y, z: tier.z + hz, sx: fx, sy: WINDOW_STRIP_HEIGHT, sz: WINDOW_STRIP_DEPTH, color },
        { x: tier.x + hx, y, z: tier.z, sx: WINDOW_STRIP_DEPTH, sy: WINDOW_STRIP_HEIGHT, sz: fz, color },
        { x: tier.x, y, z: tier.z - hz, sx: fx, sy: WINDOW_STRIP_HEIGHT, sz: WINDOW_STRIP_DEPTH, color },
        { x: tier.x - hx, y, z: tier.z, sx: WINDOW_STRIP_DEPTH, sy: WINDOW_STRIP_HEIGHT, sz: fz, color },
      )
    }
  }
  return strips
}

/** Roof parts: a lighter cap slab or a four-sided pyramid on the top tier. */
export function getRoofParts(building: BuildingSpec, color: string): BoxInstance[] {
  const tiers = getBuildingTiers(building)
  const top = tiers[tiers.length - 1]
  if (building.roof === "cap") {
    return [{ x: top.x, y: top.top + CAP_HEIGHT / 2, z: top.z, sx: top.width * 1.08, sy: CAP_HEIGHT, sz: top.depth * 1.08, color }]
  }
  if (building.roof === "pyramid") {
    return [
      {
        x: top.x,
        y: top.top + PYRAMID_HEIGHT / 2,
        z: top.z,
        sx: top.width,
        sy: PYRAMID_HEIGHT,
        sz: top.depth,
        color,
        shape: "pyramid",
      },
    ]
  }
  return []
}

export interface CityBlocks {
  /** One chamfered slab per island (built as its own geometry, see components/city3d/city-blocks.tsx). */
  platforms: BoxInstance[]
  /** Platform top color per island, same order as `platforms`. */
  platformTops: string[]
  rims: GlowInstance[]
  plazas: BoxInstance[]
  /** Lit parts: building tiers, roofs, masts. */
  buildings: BoxInstance[]
  /** Glowing parts: windows, plaza trims and rooftop beacons. */
  windows: GlowInstance[]
  masts: BoxInstance[]
  beacons: GlowInstance[]
}

const PLATFORM_SIDE_BASE = "#94a3b8"
const RIM_THICKNESS = 0.09

/** Island side color: the district base tone lifted toward slate, tinted with the district color. */
export function getPlatformColor(island: Pick<IslandLayout, "baseColor" | "color">): string {
  return mixHex(mixHex(island.baseColor, PLATFORM_SIDE_BASE, 0.45), island.color, 0.25)
}

/** Island top: neutral slate with a hint of the district accent. */
export function getPlatformTopColor(island: Pick<IslandLayout, "color">): string {
  return mixHex(ISLAND_TOP, island.color, 0.1)
}

/** Corner cut of the island platforms (world units). */
export const PLATFORM_CHAMFER = 0.35
/** Bevel between the platform top and its sides; the neon rim runs along its lower edge. */
export const PLATFORM_BEVEL = 0.12

/**
 * Neon frame around a rectangle at height `y`, as thin glowing bars. With a
 * corner `cut` the bars stop short of the corners and a diagonal bar closes
 * each one, following a chamfered outline.
 */
export function neonFrame(rect: WorldRect, y: number, thickness: number, color: string, cut = 0): GlowInstance[] {
  const w = rect.maxX - rect.minX
  const d = rect.maxZ - rect.minZ
  const cx = (rect.minX + rect.maxX) / 2
  const cz = (rect.minZ + rect.maxZ) / 2
  const c = Math.max(0, Math.min(cut, w / 2, d / 2))
  const bars: GlowInstance[] = [
    { x: cx, y, z: rect.minZ, sx: w - c * 2, sy: thickness, sz: thickness, color },
    { x: cx, y, z: rect.maxZ, sx: w - c * 2, sy: thickness, sz: thickness, color },
    { x: rect.minX, y, z: cz, sx: thickness, sy: thickness, sz: d - c * 2, color },
    { x: rect.maxX, y, z: cz, sx: thickness, sy: thickness, sz: d - c * 2, color },
  ]
  if (c > 0) {
    const diagonal = c * Math.SQRT2 + thickness
    const h = c / 2
    bars.push(
      { x: rect.minX + h, y, z: rect.minZ + h, sx: diagonal, sy: thickness, sz: thickness, color, ry: Math.PI / 4 },
      { x: rect.maxX - h, y, z: rect.minZ + h, sx: diagonal, sy: thickness, sz: thickness, color, ry: -Math.PI / 4 },
      { x: rect.minX + h, y, z: rect.maxZ - h, sx: diagonal, sy: thickness, sz: thickness, color, ry: -Math.PI / 4 },
      { x: rect.maxX - h, y, z: rect.maxZ - h, sx: diagonal, sy: thickness, sz: thickness, color, ry: Math.PI / 4 },
    )
  }
  return bars
}

/** Platforms, neon rims, plazas, buildings with setbacks and roofs, windows, masts and beacons. */
export function buildCityBlocks(islands: readonly IslandLayout[]): CityBlocks {
  const blocks: CityBlocks = {
    platforms: [],
    platformTops: [],
    rims: [],
    plazas: [],
    buildings: [],
    windows: [],
    masts: [],
    beacons: [],
  }

  for (const island of islands) {
    const { bounds, color } = island
    const rng = createRng(hashString(`windows:${island.id}`))

    blocks.platforms.push({
      x: island.center.x,
      y: -ISLAND_HEIGHT / 2,
      z: island.center.z,
      sx: island.width,
      sy: ISLAND_HEIGHT,
      sz: island.depth,
      color: getPlatformColor(island),
    })
    blocks.platformTops.push(getPlatformTopColor(island))

    // Neon edge along the lower line of the top bevel, following the chamfered corners.
    blocks.rims.push(...neonFrame(bounds, -PLATFORM_BEVEL, RIM_THICKNESS, color, PLATFORM_CHAMFER))

    // Plaza floor (robots stand on its top at PLAZA_HEIGHT) with a dim trim in the district color.
    const plaza = island.walkArea
    blocks.plazas.push({
      x: (plaza.minX + plaza.maxX) / 2,
      y: PLAZA_HEIGHT / 2,
      z: (plaza.minZ + plaza.maxZ) / 2,
      sx: plaza.maxX - plaza.minX + 0.6,
      sy: PLAZA_HEIGHT,
      sz: plaza.maxZ - plaza.minZ + 0.4,
      color: mixHex(PLAZA_COLOR, color, 0.12),
    })
    blocks.windows.push(
      ...neonFrame(
        { minX: plaza.minX - 0.3, maxX: plaza.maxX + 0.3, minZ: plaza.minZ - 0.2, maxZ: plaza.maxZ + 0.2 },
        PLAZA_HEIGHT,
        0.05,
        mixHex(color, "#0f172a", 0.35),
      ),
    )

    const roofColor = mixHex(ROOF_COLOR, color, 0.12)
    const buildings = generateBuildings(island)
    buildings.forEach((building, index) => {
      const facade = mixHex(FACADE_TONES[index % FACADE_TONES.length], color, 0.14)
      for (const tier of getBuildingTiers(building)) {
        const span = tier.top - tier.bottom
        blocks.buildings.push({ x: tier.x, y: tier.bottom + span / 2, z: tier.z, sx: tier.width, sy: span, sz: tier.depth, color: facade })
      }
      blocks.buildings.push(...getRoofParts(building, roofColor))
      // Some buildings glow dimmer so the windows do not read as one flat pattern.
      const windowColor = rng() < 0.35 ? mixHex(color, "#0f172a", 0.45) : color
      blocks.windows.push(...getWindowStrips(building, windowColor))
      if (building.hasAntenna) {
        const mastHeight = 0.9
        const top = building.height + (building.roof === "cap" ? CAP_HEIGHT : 0)
        blocks.masts.push({ x: building.x, y: top + mastHeight / 2, z: building.z, sx: 0.07, sy: mastHeight, sz: 0.07, color: MAST_COLOR, shape: "cylinder" })
        blocks.beacons.push({
          x: building.x,
          y: top + mastHeight + 0.07,
          z: building.z,
          sx: 0.18,
          sy: 0.18,
          sz: 0.18,
          color,
          shape: "octahedron",
          blink: index % 2 === 0 ? 1 : 2,
        })
      }
    })
  }
  return blocks
}

export interface PartBatch {
  key: string
  shape: PartShape
  blink: BlinkPhase
  parts: GlowInstance[]
}

/**
 * Groups parts by shape (and by blink phase when `withBlink`), so each batch
 * becomes one InstancedMesh: one draw call.
 */
export function groupParts(parts: readonly GlowInstance[], withBlink: boolean): PartBatch[] {
  const batches = new Map<string, PartBatch>()
  for (const part of parts) {
    const shape = part.shape ?? "box"
    const blink: BlinkPhase = withBlink ? (part.blink ?? 0) : 0
    const key = `${shape}:${blink}`
    let batch = batches.get(key)
    if (!batch) {
      batch = { key, shape, blink, parts: [] }
      batches.set(key, batch)
    }
    batch.parts.push(part)
  }
  return [...batches.values()]
}
