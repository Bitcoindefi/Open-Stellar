import { clamp, type WorldPoint, type WorldRect } from "./layout"

/**
 * Deterministic walk loops for 3D robots. Everything is derived from the agent
 * id, so a robot walks the same loop after every reload and neighbours do not
 * march in lockstep.
 */

/** FNV-1a 32-bit hash of a string. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Small seeded PRNG (mulberry32) returning floats in [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function clampToRect(point: WorldPoint, rect: WorldRect, margin = 0): WorldPoint {
  const minX = Math.min(rect.minX + margin, (rect.minX + rect.maxX) / 2)
  const maxX = Math.max(rect.maxX - margin, (rect.minX + rect.maxX) / 2)
  const minZ = Math.min(rect.minZ + margin, (rect.minZ + rect.maxZ) / 2)
  const maxZ = Math.max(rect.maxZ - margin, (rect.minZ + rect.maxZ) / 2)
  return { x: clamp(point.x, minX, maxX), z: clamp(point.z, minZ, maxZ) }
}

/** Walk speed in world units per second. */
export const WALK_SPEED = 0.85
/** Distance kept between waypoints and the plaza edge. */
export const PATH_MARGIN = 0.55

/**
 * A closed loop of `points` waypoints inside `area`, one per sector going
 * around the plaza so the loop never crosses itself. When `start` is given it
 * replaces the closest waypoint, so a robot begins where the 2D map had it.
 */
export function buildWalkPath(agentId: string, area: WorldRect, start?: WorldPoint, points = 4): WorldPoint[] {
  const count = Math.max(2, Math.floor(points))
  const rng = createRng(hashString(agentId))
  const cx = (area.minX + area.maxX) / 2
  const cz = (area.minZ + area.maxZ) / 2
  const rx = Math.max(0, (area.maxX - area.minX) / 2 - PATH_MARGIN)
  const rz = Math.max(0, (area.maxZ - area.minZ) / 2 - PATH_MARGIN)
  const turn = rng() * Math.PI * 2
  const path: WorldPoint[] = []
  for (let i = 0; i < count; i++) {
    const angle = turn + (i / count) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / count)
    const reach = 0.45 + rng() * 0.55
    path.push(clampToRect({ x: cx + Math.cos(angle) * rx * reach, z: cz + Math.sin(angle) * rz * reach }, area, PATH_MARGIN))
  }
  if (start) {
    const anchor = clampToRect(start, area, PATH_MARGIN)
    let closest = 0
    let best = Infinity
    path.forEach((point, index) => {
      const d = Math.hypot(point.x - anchor.x, point.z - anchor.z)
      if (d < best) {
        best = d
        closest = index
      }
    })
    path[closest] = anchor
    // Rotate so the loop starts at the anchor.
    return [...path.slice(closest), ...path.slice(0, closest)]
  }
  return path
}

/** Total length of the closed loop through `path`. */
export function getLoopLength(path: readonly WorldPoint[]): number {
  if (path.length < 2) return 0
  let total = 0
  for (let i = 0; i < path.length; i++) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    total += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return total
}

export interface PathSample {
  x: number
  z: number
  /** Rotation around y that makes a +z-facing model look along the direction of travel. */
  heading: number
}

/** Position and heading after travelling `distance` along the closed loop. */
export function samplePath(path: readonly WorldPoint[], distance: number): PathSample {
  if (path.length === 0) return { x: 0, z: 0, heading: 0 }
  const first = path[0]
  const total = getLoopLength(path)
  if (total === 0 || !Number.isFinite(distance)) return { x: first.x, z: first.z, heading: 0 }
  let remaining = ((distance % total) + total) % total
  for (let i = 0; i < path.length; i++) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length === 0) continue
    if (remaining <= length) {
      const t = remaining / length
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        heading: Math.atan2(b.x - a.x, b.z - a.z),
      }
    }
    remaining -= length
  }
  return { x: first.x, z: first.z, heading: 0 }
}

/** Shortest-way interpolation between two angles (radians). */
export function lerpAngle(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2
  let delta = (to - from) % twoPi
  if (delta > Math.PI) delta -= twoPi
  if (delta < -Math.PI) delta += twoPi
  return from + delta * clamp(t, 0, 1)
}
