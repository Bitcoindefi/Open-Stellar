import type { District, DistrictId } from "@/lib/types"

/**
 * World layout for the 3D city. The 2D map (lib/data.ts DISTRICTS) stays the
 * source of truth: every district rectangle becomes an "island" at the same
 * relative place, so the 3D view reads like the 2D one seen at an angle.
 *
 * Axes: x grows to the right of the 2D map, z grows down the 2D map (toward the
 * default camera), y is up. Island tops sit at y = 0.
 */

/** World units per 2D map pixel. */
export const WORLD_SCALE = 1 / 20
/** Trimmed from each island side so neighbouring districts read as separate platforms. */
export const ISLAND_INSET = 0.45
/** Thickness of an island platform below y = 0. */
export const ISLAND_HEIGHT = 0.6
/** Height of the plaza floor robots walk on. */
export const PLAZA_HEIGHT = 0.05

export interface WorldPoint {
  x: number
  z: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface WorldRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface CityFrame {
  /** 2D map pixel that lands on the world origin. */
  originX: number
  originY: number
  /** World-space extent of the whole city. */
  width: number
  depth: number
}

export interface IslandLayout {
  id: DistrictId
  name: string
  color: string
  baseColor: string
  center: WorldPoint
  width: number
  depth: number
  /** Top surface of the platform. */
  bounds: WorldRect
  /** Open plaza at the front of the island where robots walk. */
  walkArea: WorldRect
}

type DistrictRect = Pick<District, "x" | "y" | "w" | "h">

export function getCityFrame(districts: readonly DistrictRect[]): CityFrame {
  if (districts.length === 0) return { originX: 0, originY: 0, width: 0, depth: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const d of districts) {
    minX = Math.min(minX, d.x)
    minY = Math.min(minY, d.y)
    maxX = Math.max(maxX, d.x + d.w)
    maxY = Math.max(maxY, d.y + d.h)
  }
  return {
    originX: (minX + maxX) / 2,
    originY: (minY + maxY) / 2,
    width: (maxX - minX) * WORLD_SCALE,
    depth: (maxY - minY) * WORLD_SCALE,
  }
}

/** Converts a 2D map pixel position into world x/z. */
export function mapToWorld(px: number, py: number, frame: CityFrame): WorldPoint {
  return {
    x: (px - frame.originX) * WORLD_SCALE,
    z: (py - frame.originY) * WORLD_SCALE,
  }
}

export function rectCenter(rect: WorldRect): WorldPoint {
  return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 }
}

export function isInsideRect(point: WorldPoint, rect: WorldRect, margin = 0): boolean {
  return (
    point.x >= rect.minX - margin &&
    point.x <= rect.maxX + margin &&
    point.z >= rect.minZ - margin &&
    point.z <= rect.maxZ + margin
  )
}

/**
 * Plaza inside an island: centred left to right, pushed toward the front edge
 * (the camera side) so buildings at the back never hide the robots.
 */
export function getWalkArea(bounds: WorldRect): WorldRect {
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const cx = (bounds.minX + bounds.maxX) / 2
  return {
    minX: cx - width * 0.3,
    maxX: cx + width * 0.3,
    minZ: bounds.minZ + depth * 0.42,
    maxZ: bounds.maxZ - Math.min(0.7, depth * 0.08),
  }
}

export function buildIslandLayouts(
  districts: readonly District[],
  frame: CityFrame = getCityFrame(districts),
): IslandLayout[] {
  return districts.map((district) => {
    const topLeft = mapToWorld(district.x, district.y, frame)
    const width = Math.max(1, district.w * WORLD_SCALE - ISLAND_INSET * 2)
    const depth = Math.max(1, district.h * WORLD_SCALE - ISLAND_INSET * 2)
    const minX = topLeft.x + ISLAND_INSET
    const minZ = topLeft.z + ISLAND_INSET
    const bounds: WorldRect = { minX, maxX: minX + width, minZ, maxZ: minZ + depth }
    return {
      id: district.id,
      name: district.name,
      color: district.color,
      baseColor: district.bgColor,
      center: rectCenter(bounds),
      width,
      depth,
      bounds,
      walkArea: getWalkArea(bounds),
    }
  })
}

/** Island for a district id, falling back to the first island for unknown ids. */
export function findIsland(islands: readonly IslandLayout[], districtId: string): IslandLayout | undefined {
  return islands.find((island) => island.id === districtId) ?? islands[0]
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export const CAMERA_FOV = 40
/** Polar angle limits (radians from straight down): never flat, never under the ground. */
export const CAMERA_POLAR_LIMITS = { min: 0.3, max: 1.15 } as const
export const CAMERA_DISTANCE_LIMITS = { min: 9, max: 140 } as const
/** Polar angle of the default isometric-ish view. */
export const DEFAULT_CAMERA_POLAR = 0.9
/** Landscape screens see the city from the front right. */
export const LANDSCAPE_AZIMUTH = 0.42
/** Portrait screens turn the city so its long side runs into the screen. */
export const PORTRAIT_AZIMUTH = 1.45
/** Halfway turn, tried when fitting square-ish free areas. */
export const DIAGONAL_AZIMUTH = 0.95
/** Free areas narrower than this aspect ratio also try the turned camera angles. */
export const TURNED_FIT_ASPECT = 1.3
/** Viewports narrower than this aspect ratio count as portrait. */
export const PORTRAIT_ASPECT = 0.9
/** Rough skyline height used to keep tall buildings inside the default frame. */
export const SKYLINE_HEIGHT = 4

export interface CameraView {
  polar: number
  azimuth: number
  distance: number
  position: Vec3
  target: Vec3
}

/** Camera position on a sphere around `target`. */
export function sphericalToPosition(distance: number, polar: number, azimuth: number, target: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const horizontal = distance * Math.sin(polar)
  return {
    x: target.x + horizontal * Math.sin(azimuth),
    y: target.y + distance * Math.cos(polar),
    z: target.z + horizontal * Math.cos(azimuth),
  }
}

/**
 * Distance that keeps the whole city footprint in view for a perspective camera.
 * The footprint is rotated by the azimuth and the depth is foreshortened by the
 * polar tilt; a small padding leaves room for labels.
 */
export function getFitDistance(
  frame: Pick<CityFrame, "width" | "depth">,
  aspect: number,
  polar: number,
  azimuth: number,
  fovDeg = CAMERA_FOV,
  padding = 1.06,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const halfW = frame.width / 2
  const halfD = frame.depth / 2
  const cosA = Math.abs(Math.cos(azimuth))
  const sinA = Math.abs(Math.sin(azimuth))
  const screenHalfWidth = halfW * cosA + halfD * sinA
  const screenHalfDepth = halfW * sinA + halfD * cosA
  const tanV = Math.tan(((fovDeg * Math.PI) / 180) / 2)
  const tanH = tanV * safeAspect
  const byWidth = (screenHalfWidth * padding) / tanH
  const byHeight = ((screenHalfDepth * Math.cos(polar) + SKYLINE_HEIGHT * Math.sin(polar)) * padding) / tanV
  return clamp(Math.max(byWidth, byHeight), CAMERA_DISTANCE_LIMITS.min, CAMERA_DISTANCE_LIMITS.max)
}

/** Default framing for a viewport: front-right on landscape, turned on portrait. */
export function getDefaultView(aspect: number, frame: Pick<CityFrame, "width" | "depth">): CameraView {
  const azimuth = aspect < PORTRAIT_ASPECT ? PORTRAIT_AZIMUTH : LANDSCAPE_AZIMUTH
  const polar = DEFAULT_CAMERA_POLAR
  const distance = getFitDistance(frame, aspect, polar, azimuth)
  const target = { x: 0, y: 0, z: 0 }
  return { polar, azimuth, distance, position: sphericalToPosition(distance, polar, azimuth, target), target }
}

// ---------------------------------------------------------------------------
// Fitting the city into the visible part of the canvas
// ---------------------------------------------------------------------------

/** Canvas pixels covered by overlays (cards, controls, bottom nav) on each side. */
export interface ViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * A world point that has to stay on screen, with room in screen pixels around
 * its projection (a label plate hanging under its anchor, for instance).
 */
export interface FitPoint extends Vec3 {
  padX?: number
  padTop?: number
  padBottom?: number
}

export interface ScreenBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Free space kept between the fitted city and the visible area's edges, in pixels. */
export const FIT_MARGIN = 10
/** Rough height of the tallest towers at the back of an island (world units). */
export const FIT_TOWER_HEIGHT = 4.2
/** The road ring around each island (world units) is part of what the framing keeps in view. */
export const FIT_GROUND_PAD = 1
/** How far the orbit target may leave the city footprint (world units), for fitting and panning. */
export const FIT_TARGET_MARGIN = 6

interface CameraBasis {
  position: Vec3
  forward: Vec3
  right: Vec3
  up: Vec3
}

function cameraBasis(target: Vec3, distance: number, polar: number, azimuth: number): CameraBasis {
  const position = sphericalToPosition(distance, polar, azimuth, target)
  const f = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z }
  const fl = Math.hypot(f.x, f.y, f.z) || 1
  const forward = { x: f.x / fl, y: f.y / fl, z: f.z / fl }
  // right = forward x worldUp, up = right x forward (no roll).
  const r = { x: -forward.z, y: 0, z: forward.x }
  const rl = Math.hypot(r.x, r.z) || 1
  const right = { x: r.x / rl, y: 0, z: r.z / rl }
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  }
  return { position, forward, right, up }
}

/**
 * Screen-space box (canvas pixels, y down) that the points and their padding
 * cover for a perspective camera orbiting `target`. Points behind the camera are skipped.
 */
export function projectFitBox(
  points: readonly FitPoint[],
  viewport: { width: number; height: number },
  target: Vec3,
  distance: number,
  polar: number,
  azimuth: number,
  fovDeg = CAMERA_FOV,
): ScreenBox {
  const { position, forward, right, up } = cameraBasis(target, distance, polar, azimuth)
  const tanV = Math.tan(((fovDeg * Math.PI) / 180) / 2)
  const tanH = tanV * (viewport.width / Math.max(1, viewport.height))
  const box: ScreenBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const p of points) {
    const v = { x: p.x - position.x, y: p.y - position.y, z: p.z - position.z }
    const depth = v.x * forward.x + v.y * forward.y + v.z * forward.z
    if (depth <= 0.01) continue
    const nx = (v.x * right.x + v.y * right.y + v.z * right.z) / (depth * tanH)
    const ny = (v.x * up.x + v.y * up.y + v.z * up.z) / (depth * tanV)
    const sx = ((nx + 1) / 2) * viewport.width
    const sy = ((1 - ny) / 2) * viewport.height
    const padX = p.padX ?? 0
    box.minX = Math.min(box.minX, sx - padX)
    box.maxX = Math.max(box.maxX, sx + padX)
    box.minY = Math.min(box.minY, sy - (p.padTop ?? 0))
    box.maxY = Math.max(box.maxY, sy + (p.padBottom ?? 0))
  }
  return box
}

/**
 * Points that must stay in view: every island's footprint, the tops of the
 * towers at its back, and its name plate (`labelPad` gives the plate size).
 */
export function getFitPoints(
  islands: readonly IslandLayout[],
  labelPad: (island: IslandLayout) => { padX: number; padBottom: number } = () => ({ padX: 0, padBottom: 0 }),
): FitPoint[] {
  const points: FitPoint[] = []
  for (const island of islands) {
    const { minX, maxX, minZ, maxZ } = island.bounds
    const g = FIT_GROUND_PAD
    points.push(
      { x: minX - g, y: 0, z: minZ - g },
      { x: maxX + g, y: 0, z: minZ - g },
      { x: minX - g, y: 0, z: maxZ + g },
      { x: maxX + g, y: 0, z: maxZ + g },
      { x: minX, y: FIT_TOWER_HEIGHT, z: minZ },
      { x: maxX, y: FIT_TOWER_HEIGHT, z: minZ },
      { x: island.center.x, y: 0, z: maxZ + 0.15, ...labelPad(island) },
    )
  }
  return points
}

export interface FitOptions {
  viewport: { width: number; height: number }
  insets?: ViewportInsets
  polar?: number
  azimuths?: readonly number[]
  frame: Pick<CityFrame, "width" | "depth">
  fovDeg?: number
  margin?: number
}

/**
 * Default camera for a viewport: the distance and orbit target that make the
 * fit points fill the part of the canvas left free by overlays (insets), as
 * large as possible and centred in it. Tries each candidate azimuth and keeps
 * the one that shows the city biggest.
 */
export function fitCameraView(points: readonly FitPoint[], options: FitOptions): CameraView {
  const { viewport, frame } = options
  const insets = options.insets ?? NO_INSETS
  const polar = options.polar ?? DEFAULT_CAMERA_POLAR
  const fovDeg = options.fovDeg ?? CAMERA_FOV
  const margin = options.margin ?? FIT_MARGIN
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  // Overlays can never leave less than half the canvas: then fit to the whole canvas instead.
  const safeLeft = insets.left + margin
  const safeTop = insets.top + margin
  let safeW = width - insets.left - insets.right - margin * 2
  let safeH = height - insets.top - insets.bottom - margin * 2
  const useInsets = safeW > width * 0.5 && safeH > height * 0.4
  const area = useInsets
    ? { left: safeLeft, top: safeTop, w: safeW, h: safeH }
    : { left: margin, top: margin, w: width - margin * 2, h: height - margin * 2 }
  safeW = Math.max(1, area.w)
  safeH = Math.max(1, area.h)
  const aspect = width / height
  // Tall or square free areas also try turning the city, then keep the angle that shows it biggest.
  const azimuths =
    options.azimuths ?? (safeW / safeH < TURNED_FIT_ASPECT ? [LANDSCAPE_AZIMUTH, DIAGONAL_AZIMUTH, PORTRAIT_AZIMUTH] : [LANDSCAPE_AZIMUTH])
  const tanV = Math.tan(((fovDeg * Math.PI) / 180) / 2)

  let best: CameraView | null = null
  for (const azimuth of azimuths) {
    let distance = getFitDistance(frame, aspect, polar, azimuth, fovDeg)
    let target: Vec3 = { x: 0, y: 0, z: 0 }
    if (points.length > 0) {
      for (let i = 0; i < 24; i++) {
        const box = projectFitBox(points, { width, height }, target, distance, polar, azimuth, fovDeg)
        if (!Number.isFinite(box.minX)) break
        const scale = Math.max((box.maxX - box.minX) / safeW, (box.maxY - box.minY) / safeH)
        distance = clamp(distance * scale, CAMERA_DISTANCE_LIMITS.min, CAMERA_DISTANCE_LIMITS.max)
        const dx = area.left + safeW / 2 - (box.minX + box.maxX) / 2
        const dy = area.top + safeH / 2 - (box.minY + box.maxY) / 2
        const worldPerPixel = (2 * distance * tanV) / height
        // Screen right on the ground is (cos az, 0, -sin az); screen up runs along the horizontal view direction.
        const rx = Math.cos(azimuth)
        const rz = -Math.sin(azimuth)
        const fx = -Math.sin(azimuth)
        const fz = -Math.cos(azimuth)
        const along = (dy * worldPerPixel) / Math.max(0.2, Math.cos(polar))
        const next = clampTarget(
          {
            x: target.x - rx * dx * worldPerPixel + fx * along,
            y: 0,
            z: target.z - rz * dx * worldPerPixel + fz * along,
          },
          frame,
          FIT_TARGET_MARGIN,
        )
        const settled = Math.abs(scale - 1) < 0.002 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5
        target = next
        if (settled) break
      }
    }
    if (!best || distance < best.distance) {
      best = { polar, azimuth, distance, position: sphericalToPosition(distance, polar, azimuth, target), target }
    }
  }
  return best ?? getDefaultView(aspect, frame)
}

/**
 * Moves the camera along its line of sight so its distance to the target is
 * multiplied by `factor` (below 1 zooms in), within the distance limits.
 */
export function scaleCameraDistance(
  position: Vec3,
  target: Vec3,
  factor: number,
  min: number = CAMERA_DISTANCE_LIMITS.min,
  max: number = CAMERA_DISTANCE_LIMITS.max,
): Vec3 {
  const dx = position.x - target.x
  const dy = position.y - target.y
  const dz = position.z - target.z
  const current = Math.hypot(dx, dy, dz)
  if (current === 0 || !Number.isFinite(factor) || factor <= 0) return { ...position }
  const next = clamp(current * factor, min, max)
  const k = next / current
  return { x: target.x + dx * k, y: target.y + dy * k, z: target.z + dz * k }
}

/** Keeps the orbit target over the city so panning cannot lose it. */
export function clampTarget(target: Vec3, frame: Pick<CityFrame, "width" | "depth">, margin = 2): Vec3 {
  const halfW = frame.width / 2 + margin
  const halfD = frame.depth / 2 + margin
  return {
    x: clamp(target.x, -halfW, halfW),
    y: 0,
    z: clamp(target.z, -halfD, halfD),
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
