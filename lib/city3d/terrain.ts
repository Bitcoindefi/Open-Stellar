import type { BoxInstance } from "./buildings"
import { hexToRgb } from "./colors"
import { ISLAND_HEIGHT, type IslandLayout, type WorldPoint, type WorldRect } from "./layout"
import { LANE_COLOR, PLATE_EDGE, ROAD_COLOR } from "./palette"

/**
 * Low-poly terrain under the 3D city: a street plate around the district
 * islands, harbor water around the plate and faceted shore land that carries
 * the skyline ring. Pure geometry data (no three.js); the meshes are built by
 * components/city3d/city-ground.tsx.
 */

/** Street plate margin around the islands (world units). */
export const PLATE_MARGIN = 2.2
/** Road ring around each island (world units). */
export const ROAD_WIDTH = 0.95
/** Plate top: the island platforms stand on it. */
export const PLATE_TOP = -ISLAND_HEIGHT
export const PLATE_THICKNESS = 0.45
/** Water surface, a little below the plate top. */
export const WATER_Y = PLATE_TOP - 0.28
/** Gentle waves: peak height and speed (radians per second). */
export const WAVE_AMPLITUDE = 0.09
export const WAVE_SPEED = 0.8
/** Plate cells for the faceted color variation (world units). */
export const PLATE_CELL = 1.6
/** Shore rings as multiples of the water ellipse: the first one is the beach line. */
export const SHORE_RINGS = [1, 1.05, 1.16, 1.32, 1.55, 1.9, 2.6, 3.8, 5.5] as const
export const SHORE_SEGMENTS = 44

export interface GroundLayout {
  /** Street plate under the districts. */
  plate: WorldRect
  center: WorldPoint
}

export interface HarborLayout {
  center: WorldPoint
  /** Water ellipse radii; the shore land starts here. */
  rx: number
  rz: number
}

/** Union of the island tops, or null without islands. */
export function getIslandsExtent(islands: readonly Pick<IslandLayout, "bounds">[]): WorldRect | null {
  if (islands.length === 0) return null
  return islands.reduce<WorldRect>(
    (acc, { bounds }) => ({
      minX: Math.min(acc.minX, bounds.minX),
      maxX: Math.max(acc.maxX, bounds.maxX),
      minZ: Math.min(acc.minZ, bounds.minZ),
      maxZ: Math.max(acc.maxZ, bounds.maxZ),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  )
}

export function expandRect(rect: WorldRect, by: number): WorldRect {
  return { minX: rect.minX - by, maxX: rect.maxX + by, minZ: rect.minZ - by, maxZ: rect.maxZ + by }
}

export function getGroundLayout(islands: readonly Pick<IslandLayout, "bounds">[], plateMargin = PLATE_MARGIN): GroundLayout {
  const extent = getIslandsExtent(islands) ?? { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
  const plate = expandRect(extent, plateMargin)
  return { plate, center: { x: (plate.minX + plate.maxX) / 2, z: (plate.minZ + plate.maxZ) / 2 } }
}

/** Water ellipse around the plate: wide enough for a clear band of water on every side. */
export function getHarborLayout(ground: GroundLayout): HarborLayout {
  const halfW = (ground.plate.maxX - ground.plate.minX) / 2
  const halfD = (ground.plate.maxZ - ground.plate.minZ) / 2
  return { center: ground.center, rx: halfW * 1.35 + 5, rz: halfD * 1.6 + 6 }
}

/** Whether every plate corner sits inside the water ellipse (never on the shore). */
export function isPlateInsideHarbor(ground: GroundLayout, harbor: HarborLayout, margin = 0.85): boolean {
  const dx = Math.max(Math.abs(ground.plate.minX - harbor.center.x), Math.abs(ground.plate.maxX - harbor.center.x))
  const dz = Math.max(Math.abs(ground.plate.minZ - harbor.center.z), Math.abs(ground.plate.maxZ - harbor.center.z))
  return Math.hypot(dx / harbor.rx, dz / harbor.rz) < margin
}

/** Point on the harbor ellipse scaled by `scale` (1 is the beach line). */
export function harborPoint(harbor: HarborLayout, angle: number, scale: number): WorldPoint {
  return {
    x: harbor.center.x + Math.cos(angle) * harbor.rx * scale,
    z: harbor.center.z + Math.sin(angle) * harbor.rz * scale,
  }
}

/**
 * Deterministic value noise in [-1, 1] for a lattice point: the same point
 * always gets the same jitter, so the terrain never shimmers between renders.
 */
export function facetNoise(ix: number, iz: number, seed = 0): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967295) * 2 - 1
}

/** Wave height at a water point and time; the water shader runs the same formula. */
export function waveHeight(x: number, z: number, time: number, amplitude = WAVE_AMPLITUDE): number {
  const t = time * WAVE_SPEED
  const w = Math.sin(x * 0.55 + t) * 0.5 + Math.sin(z * 0.7 - t * 0.8) * 0.3 + Math.sin((x + z) * 0.3 + t * 0.6) * 0.2
  return amplitude * w
}

/** Same as waveHeight, as GLSL over `pos` (x, z) and `uTime`; keep the two in sync. */
export const WAVE_GLSL = `(${WAVE_AMPLITUDE.toFixed(3)} * (sin(pos.x * 0.55 + uTime * ${WAVE_SPEED.toFixed(2)}) * 0.5 + sin(pos.y * 0.7 - uTime * ${(WAVE_SPEED * 0.8).toFixed(2)}) * 0.3 + sin((pos.x + pos.y) * 0.3 + uTime * ${(WAVE_SPEED * 0.6).toFixed(2)}) * 0.2))`

/** Non-indexed triangles with one flat color per facet (the classic low-poly look). */
export interface FacetMesh {
  positions: Float32Array
  /** Linear 0-1 RGB per vertex, the same for the three corners of a facet. */
  colors: Float32Array
  triangles: number
}

function pushTriangle(
  positions: number[],
  colors: number[],
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  rgb: readonly number[],
): void {
  positions.push(...a, ...b, ...c)
  colors.push(...rgb, ...rgb, ...rgb)
}

/** sRGB channel (0-255) to linear 0-1, the space three.js expects for vertex colors. */
export function srgbToLinear(channel: number): number {
  const v = channel / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function toRgb01(hex: string): number[] {
  const c = hexToRgb(hex) ?? { r: 128, g: 128, b: 128 }
  return [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)]
}

/** Picks a tone from `tones` by noise and shades it a touch up or down. */
function facetColor(tones: readonly string[], noise: number, shade: number): number[] {
  const base = toRgb01(tones[Math.floor(((noise + 1) / 2) * tones.length) % tones.length])
  const k = 1 + shade
  return base.map((v) => Math.min(1, Math.max(0, v * k)))
}

/**
 * Flat faceted grid over a rectangle at height `y`: two triangles per cell,
 * each with its own tone. Used for the street plate top.
 */
export function buildGridFacets(rect: WorldRect, cell: number, y: number, tones: readonly string[], seed = 1): FacetMesh {
  const cols = Math.max(1, Math.round((rect.maxX - rect.minX) / cell))
  const rows = Math.max(1, Math.round((rect.maxZ - rect.minZ) / cell))
  const cw = (rect.maxX - rect.minX) / cols
  const ch = (rect.maxZ - rect.minZ) / rows
  const positions: number[] = []
  const colors: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = rect.minX + c * cw
      const z0 = rect.minZ + r * ch
      const p00 = [x0, y, z0]
      const p10 = [x0 + cw, y, z0]
      const p01 = [x0, y, z0 + ch]
      const p11 = [x0 + cw, y, z0 + ch]
      // Counter-clockwise seen from above so the facets face up.
      pushTriangle(positions, colors, p00, p01, p10, facetColor(tones, facetNoise(c, r, seed), 0.04 * facetNoise(c, r, seed + 7)))
      pushTriangle(positions, colors, p10, p01, p11, facetColor(tones, facetNoise(c, r, seed + 3), 0.04 * facetNoise(c, r, seed + 11)))
    }
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), triangles: positions.length / 9 }
}

/** Shore height for ring `ring` (0 is the beach line, just under the water). */
export function shoreHeight(ring: number, noise: number): number {
  if (ring === 0) return WATER_Y - 0.12
  if (ring === 1) return WATER_Y + 0.18 + noise * 0.04
  return PLATE_TOP + 0.05 + noise * Math.min(0.5, 0.12 * ring)
}

/**
 * Faceted shore land between the harbor ellipse and the far horizon: rings of
 * jittered vertices that rise from the beach line into low rolling ground.
 */
export function buildShoreFacets(harbor: HarborLayout, tones: readonly string[], seed = 5, segments = SHORE_SEGMENTS): FacetMesh {
  const arc = (Math.PI * 2) / segments
  const grid: number[][][] = SHORE_RINGS.map((scale, ring) => {
    // Jitter stays well under the gap to the neighbouring rings, so no facet folds over.
    const gap = Math.min(
      ring > 0 ? scale - SHORE_RINGS[ring - 1] : Infinity,
      ring < SHORE_RINGS.length - 1 ? SHORE_RINGS[ring + 1] - scale : Infinity,
    )
    const angleAmount = ring === 0 ? 0 : Math.min(0.35, (0.2 * gap) / (scale * arc))
    const radialAmount = ring === 0 ? 0 : 0.2 * gap
    return Array.from({ length: segments }, (_, s) => {
      const angle = (s + facetNoise(s, ring, seed) * angleAmount) * arc
      const radial = scale + facetNoise(s, ring, seed + 1) * radialAmount
      const p = harborPoint(harbor, angle, radial)
      return [p.x, shoreHeight(ring, facetNoise(s, ring, seed + 2)), p.z]
    })
  })
  const positions: number[] = []
  const colors: number[] = []
  for (let ring = 0; ring < SHORE_RINGS.length - 1; ring++) {
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments
      const a = grid[ring][s]
      const b = grid[ring][next]
      const c = grid[ring + 1][s]
      const d = grid[ring + 1][next]
      // Angles grow from +x toward +z, so a, b, c and b, d, c face up.
      pushTriangle(positions, colors, a, b, c, facetColor(tones, facetNoise(s, ring, seed + 4), 0.07 * facetNoise(s, ring, seed + 9)))
      pushTriangle(positions, colors, b, d, c, facetColor(tones, facetNoise(s, ring, seed + 6), 0.07 * facetNoise(s, ring, seed + 13)))
    }
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), triangles: positions.length / 9 }
}

/** Dashes along the edges of `rect` (clockwise), each `dash` long with `gap` between them. */
export function getLaneDashes(rect: WorldRect, y: number, dash = 0.42, gap = 0.34, width = 0.07): BoxInstance[] {
  const dashes: BoxInstance[] = []
  const step = dash + gap
  const along = (from: number, to: number, place: (center: number, length: number) => BoxInstance) => {
    const span = to - from
    const count = Math.floor((span + gap) / step)
    if (count <= 0) return
    const used = count * step - gap
    const start = from + (span - used) / 2
    for (let i = 0; i < count; i++) dashes.push(place(start + i * step + dash / 2, dash))
  }
  const sy = 0.02
  along(rect.minX, rect.maxX, (cx, len) => ({ x: cx, y, z: rect.minZ, sx: len, sy, sz: width, color: LANE_COLOR }))
  along(rect.minX, rect.maxX, (cx, len) => ({ x: cx, y, z: rect.maxZ, sx: len, sy, sz: width, color: LANE_COLOR }))
  along(rect.minZ, rect.maxZ, (cz, len) => ({ x: rect.minX, y, z: cz, sx: width, sy, sz: len, color: LANE_COLOR }))
  along(rect.minZ, rect.maxZ, (cz, len) => ({ x: rect.maxX, y, z: cz, sx: width, sy, sz: len, color: LANE_COLOR }))
  return dashes
}

/** Four boxes that outline `rect` as a band `width` wide (roads, neon edges). */
export function getRectFrame(rect: WorldRect, y: number, width: number, height: number, color: string): BoxInstance[] {
  const w = rect.maxX - rect.minX
  const d = rect.maxZ - rect.minZ
  const cx = (rect.minX + rect.maxX) / 2
  const cz = (rect.minZ + rect.maxZ) / 2
  return [
    { x: cx, y, z: rect.minZ + width / 2, sx: w, sy: height, sz: width, color },
    { x: cx, y, z: rect.maxZ - width / 2, sx: w, sy: height, sz: width, color },
    { x: rect.minX + width / 2, y, z: cz, sx: width, sy: height, sz: d - width * 2, color },
    { x: rect.maxX - width / 2, y, z: cz, sx: width, sy: height, sz: d - width * 2, color },
  ]
}

export interface StreetLayout {
  roads: BoxInstance[]
  lanes: BoxInstance[]
  /** Neon edge around the plate top. */
  edges: BoxInstance[]
}

/** Road ring with a dashed center lane around every island, plus the plate's neon edge. */
export function buildStreets(islands: readonly Pick<IslandLayout, "bounds">[], ground: GroundLayout): StreetLayout {
  const roadY = PLATE_TOP + 0.02
  const roads: BoxInstance[] = []
  const lanes: BoxInstance[] = []
  for (const island of islands) {
    roads.push(...getRectFrame(expandRect(island.bounds, ROAD_WIDTH), roadY, ROAD_WIDTH, 0.04, ROAD_COLOR))
    lanes.push(...getLaneDashes(expandRect(island.bounds, ROAD_WIDTH / 2), roadY + 0.025))
  }
  const edges = getRectFrame(expandRect(ground.plate, -0.08), PLATE_TOP + 0.05, 0.16, 0.1, PLATE_EDGE)
  return { roads, lanes, edges }
}
