import { getRobotColorFilter, getRobotSkinFilter, type RobotSpriteSet } from "@/lib/robot-sprites"

/**
 * Pixel robots for the 3D city: the same sprite strips as the 2D map
 * (lib/robot-sprites.ts), drawn as camera-facing billboards. Pure helpers with
 * no three.js dependency so they stay unit-testable.
 */

/** World units per sprite pixel: Nexus, the tallest robot (156 px), stands 3.2 units tall. */
export const SPRITE_WORLD_SCALE = 3.2 / 156

/** Offline robots read as powered down, like the 2D map draws them. */
export const OFFLINE_SPRITE_FILTER = "grayscale(1) brightness(0.6)"
export const OFFLINE_SPRITE_OPACITY = 0.55

/** Alpha below this is discarded, so the transparent cell margins never hide what is behind. */
export const SPRITE_ALPHA_TEST = 0.12

/** World size of one strip cell. */
export function getSpriteWorldSize(
  set: Pick<RobotSpriteSet, "frameWidth" | "frameHeight">,
  scale = SPRITE_WORLD_SCALE,
): { width: number; height: number } {
  return { width: set.frameWidth * scale, height: set.frameHeight * scale }
}

export interface FrameWindow {
  /** Texture offset.x for the cell. */
  offsetX: number
  /** Texture repeat.x; negative mirrors the cell for a left-facing robot. */
  repeatX: number
}

/** Horizontal UV window of one cell of a strip of `frames` equal cells. */
export function getFrameWindow(frame: number, frames: number, facingLeft = false): FrameWindow {
  const count = Math.max(1, Math.floor(Number.isFinite(frames) ? frames : 1))
  const step = Number.isFinite(frame) ? Math.floor(frame) : 0
  const index = ((step % count) + count) % count
  const width = 1 / count
  return facingLeft ? { offsetX: (index + 1) * width, repeatX: -width } : { offsetX: index * width, repeatX: width }
}

export interface SpriteLook {
  /** Offline or stopped: grayscale, dimmed. */
  dim: boolean
  /** Agent color, applied as a hue shift when it differs from the robot accent. */
  color?: string | null
  /** Agent skin (neon, chrome, gold), applied as a filter like the 2D map. */
  skin?: string | null
  /** District color, used by the neon skin outline. */
  outlineColor: string
}

/**
 * Canvas filter that bakes an agent's look into its copy of the strip, or null
 * when the native art is used as is. Same filters as the 2D renderer.
 */
export function getSpriteFilter(set: Pick<RobotSpriteSet, "accentHue">, look: SpriteLook): string | null {
  if (look.dim) return OFFLINE_SPRITE_FILTER
  const filters: string[] = []
  const color = getRobotColorFilter(set, look.color)
  if (color) filters.push(color)
  const skin = getRobotSkinFilter(look.skin, look.outlineColor)
  if (skin) filters.push(skin)
  return filters.length > 0 ? filters.join(" ") : null
}

/** Cache key for a strip variant: one texture per robot type and filter. */
export function getSpriteVariantKey(sheet: string, filter: string | null): string {
  return filter ? `${sheet}|${filter}` : sheet
}

/** Below this share of the step along the screen axis the robot keeps its side (walking toward or away from the camera). */
export const FACING_THRESHOLD = 0.2

/**
 * Whether a robot heading along (dx, dz) faces left on screen, given the
 * camera's right vector on the ground plane. The strips face right, so a robot
 * walking toward screen left is mirrored. Keeps `previous` near the screen
 * vertical so it does not flicker.
 */
export function isFacingLeft(
  dx: number,
  dz: number,
  rightX: number,
  rightZ: number,
  previous: boolean,
  threshold = FACING_THRESHOLD,
): boolean {
  const length = Math.hypot(dx, dz) * Math.hypot(rightX, rightZ)
  if (!Number.isFinite(length) || length === 0) return previous
  const along = (dx * rightX + dz * rightZ) / length
  if (Math.abs(along) < threshold) return previous
  return along < 0
}
