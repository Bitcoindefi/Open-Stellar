import type { ViewportInsets } from "./layout"

/**
 * Which parts of the map canvas are hidden by overlays (challenge card, map
 * controls, audio controls, the phone's bottom nav). Overlays mark themselves
 * with `data-map-overlay="top"` or `"bottom"`; the 3D camera then frames the
 * city in what is left.
 *
 * No three.js or DOM imports: the math works on plain rectangles.
 */

/** Below this map width the overlays switch to their compact phone layout. */
export const NARROW_MAP_WIDTH = 540

/** Insets used on wide maps, where overlays sit in the corners over sky and water. */
export const WIDE_MAP_INSETS: ViewportInsets = { top: 48, right: 0, bottom: 36, left: 0 }

export type OverlaySide = "top" | "bottom"

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface OverlayRect extends Rect {
  side: OverlaySide
}

export function parseOverlaySide(value: string | null | undefined): OverlaySide | null {
  return value === "top" || value === "bottom" ? value : null
}

/**
 * How far top overlays reach down into the container and bottom overlays reach
 * up into it, in pixels. Overlays that do not overlap the container, or have no
 * size (hidden), are ignored. Only narrow maps measure overlays; wide maps get
 * WIDE_MAP_INSETS because their overlays sit in the corners.
 */
export function computeOverlayInsets(container: Rect, overlays: readonly OverlayRect[]): ViewportInsets {
  const width = container.right - container.left
  const height = container.bottom - container.top
  if (width <= 0 || height <= 0) return { top: 0, right: 0, bottom: 0, left: 0 }
  if (width >= NARROW_MAP_WIDTH) return { ...WIDE_MAP_INSETS }
  let top = 0
  let bottom = 0
  for (const overlay of overlays) {
    if (overlay.right - overlay.left <= 0 || overlay.bottom - overlay.top <= 0) continue
    const overlapsX = overlay.right > container.left && overlay.left < container.right
    const overlapsY = overlay.bottom > container.top && overlay.top < container.bottom
    if (!overlapsX || !overlapsY) continue
    if (overlay.side === "top") top = Math.max(top, overlay.bottom - container.top)
    else bottom = Math.max(bottom, container.bottom - overlay.top)
  }
  return {
    top: Math.round(Math.min(top, height)),
    right: 0,
    bottom: Math.round(Math.min(bottom, height)),
    left: 0,
  }
}

export function sameInsets(a: ViewportInsets | null, b: ViewportInsets | null): boolean {
  if (!a || !b) return a === b
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
}
