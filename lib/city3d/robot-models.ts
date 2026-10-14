/**
 * Low-poly robots for the 3D city: one faceted GLB per district under
 * public/models/robots. Each model is normalized (feet at y = 0, centered on
 * x/z, 1 unit tall, facing +z) with a vertex-colored "body" primitive and
 * emissive "glow" primitives. Pure helpers with no three.js dependency so they
 * stay unit-testable.
 */

export const ROBOT_MODEL_DISTRICTS = ["data-center", "comm-hub", "processing", "defense", "research"] as const
export type RobotModelDistrict = (typeof ROBOT_MODEL_DISTRICTS)[number]

export const ROBOT_MODEL_BASE = "/models/robots"

/** URL of a district's robot model, or null for an unknown district (the placeholder robot is drawn then). */
export function getRobotModelUrl(district: string): string | null {
  return (ROBOT_MODEL_DISTRICTS as readonly string[]).includes(district) ? `${ROBOT_MODEL_BASE}/${district}.glb` : null
}

/** World height of a robot: tall enough to read next to the 1 to 4.6 unit buildings at the default zoom. */
export const ROBOT_WORLD_HEIGHT = 2

/** Shared surface look of the robot bodies (faceted, slightly satin). */
export const ROBOT_SURFACE = { roughness: 0.8, metalness: 0.1 } as const
/** Emissive strength of the eyes, visors and trims. */
export const ROBOT_GLOW_INTENSITY = 0.65

/** Offline robots: vertex colors multiplied by this gray, glows switched off. */
export const OFFLINE_BODY_TINT = "#6b7280"
/** Error flash and ring color. */
export const ALERT_COLOR = "#ef4444"
/** Peak emissive strength of the error flash on the body. */
export const ALERT_FLASH_INTENSITY = 0.55

/** Footprint rings, in world units (the robots are about 1.1 to 1.4 units wide). */
export const ROBOT_RINGS = {
  shadow: 0.7,
  accent: { inner: 0.62, outer: 0.78 },
  focus: { inner: 0.92, outer: 1.06 },
} as const

/** True for the emissive primitives of a robot model ("glow", "glow-0", "glow-1"). */
export function isGlowMaterialName(name: string | null | undefined): boolean {
  return typeof name === "string" && /^glow(-\d+)?$/.test(name.trim())
}

/** Gentle idle sway (radians around z and y) at `timeSec`; zero when the robot holds still. */
export function idleSway(timeSec: number, phase = 0): { roll: number; yaw: number } {
  if (!Number.isFinite(timeSec)) return { roll: 0, yaw: 0 }
  return {
    roll: Math.sin(timeSec * 1.6 + phase) * 0.05,
    yaw: Math.sin(timeSec * 0.7 + phase * 1.3) * 0.18,
  }
}

/** Small side to side waddle (radians around z) of a walking robot, in step with the walk bob. */
export function walkWaddle(timeSec: number, phase = 0): number {
  if (!Number.isFinite(timeSec)) return 0
  return Math.sin(timeSec * 3.5 + phase) * 0.06
}

/** Forward lean (radians around x) of a walking robot. */
export const WALK_LEAN = 0.08

/**
 * Heading (rotation around y for a +z facing model) that turns a robot standing
 * at `from` toward `to`, plus a small per-robot `jitter` so a group does not
 * look lined up. Falls back to `jitter` alone when the points coincide.
 */
export function headingToward(
  from: { x: number; z: number },
  to: { x: number; z: number },
  jitter = 0,
): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx === 0 && dz === 0)) return jitter
  return Math.atan2(dx, dz) + jitter
}
