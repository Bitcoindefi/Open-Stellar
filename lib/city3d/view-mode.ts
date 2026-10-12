/**
 * 2D / 3D city map preference.
 *
 * The choice is kept in localStorage so it survives reloads. Storage can be
 * missing or throw (private windows, blocked site data, previews), so every
 * access is guarded and the map falls back to the 2D canvas.
 *
 * This module must stay free of three.js imports: the 2D path loads it.
 */
export type MapViewMode = "2d" | "3d"

export const MAP_VIEW_STORAGE_KEY = "agentic-city:map-view"
export const DEFAULT_MAP_VIEW: MapViewMode = "2d"
export const MAP_VIEW_MODES: readonly MapViewMode[] = ["2d", "3d"]

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "setItem">

/** Normalises any stored value to a known mode (unknown values mean 2D). */
export function parseMapViewMode(value: unknown): MapViewMode {
  return value === "3d" ? "3d" : DEFAULT_MAP_VIEW
}

/** The browser's localStorage, or null when it is unavailable or blocked. */
export function getBrowserStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null
    return window.localStorage ?? null
  } catch {
    return null
  }
}

export function readMapViewMode(storage: ReadableStorage | null | undefined): MapViewMode {
  if (!storage) return DEFAULT_MAP_VIEW
  try {
    return parseMapViewMode(storage.getItem(MAP_VIEW_STORAGE_KEY))
  } catch {
    return DEFAULT_MAP_VIEW
  }
}

/** Persists the mode. Returns false when storage is missing or refuses the write. */
export function writeMapViewMode(storage: WritableStorage | null | undefined, mode: MapViewMode): boolean {
  if (!storage) return false
  try {
    storage.setItem(MAP_VIEW_STORAGE_KEY, mode)
    return true
  } catch {
    return false
  }
}

interface WebGLProbeCanvas {
  getContext(contextId: string): unknown
}

interface LoseContextExtension {
  loseContext(): void
}

function releaseContext(context: unknown): void {
  const gl = context as { getExtension?: (name: string) => LoseContextExtension | null } | null
  try {
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext()
  } catch {
    // Best effort: the probe context is garbage collected anyway.
  }
}

/**
 * True when the browser can create a WebGL context. The probe context is
 * released straight away so it does not count against the page's context limit.
 */
export function detectWebGL(createCanvas?: () => WebGLProbeCanvas | null): boolean {
  try {
    const factory =
      createCanvas ?? (typeof document === "undefined" ? null : () => document.createElement("canvas"))
    if (!factory) return false
    const canvas = factory()
    if (!canvas) return false
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl")
    if (!context) return false
    releaseContext(context)
    return true
  } catch {
    return false
  }
}
