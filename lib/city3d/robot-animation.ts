/**
 * Skinned robot animation rules for the 3D city: which clip a robot plays for
 * its status and how fast. Pure helpers with no three.js dependency so they
 * stay unit-testable; components/city3d/robot-animator.ts applies them.
 */

/** Clip names every rigged robot model ships. */
export const WALK_CLIP = "Walk"
export const IDLE_CLIP = "Idle"

/** Seconds the old clip fades into the new one when a robot changes mode. */
export const CLIP_CROSSFADE = 0.25

/**
 * Ground speed of the in-place walk cycle at timeScale 1, in model heights per
 * second. Moving the robot at this speed keeps the feet (or the tank hubs) from
 * sliding over the plaza.
 */
export const WALK_CLIP_SPEED = 0.475

/**
 * - walk: the walk cycle, robot moving along its loop;
 * - idle: the idle loop (standing robots, and errors, which flash red as well);
 * - still: a frozen pose, no clock (offline robots and reduced motion).
 */
export type RobotAnimMode = "walk" | "idle" | "still"

export function getRobotAnimMode(
  motion: { walk: boolean; dim: boolean },
  reduceMotion: boolean,
): RobotAnimMode {
  if (reduceMotion || motion.dim) return "still"
  return motion.walk ? "walk" : "idle"
}

/**
 * Walk cycle time scale for a robot moving at `worldSpeed` world units per
 * second with a `worldHeight` tall model. Clamped so an odd speed never makes
 * the legs blur or crawl.
 */
export function walkTimeScale(worldSpeed: number, worldHeight: number): number {
  if (!(worldSpeed > 0) || !(worldHeight > 0) || !Number.isFinite(worldSpeed) || !Number.isFinite(worldHeight)) return 1
  const scale = worldSpeed / worldHeight / WALK_CLIP_SPEED
  return Math.min(2, Math.max(0.5, scale))
}

/** Start offset in [0, 1) of a robot's loops, so robots of a district do not move in lockstep. */
export function clipPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0
  const unit = phase / (Math.PI * 2)
  return unit - Math.floor(unit)
}
