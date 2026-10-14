/**
 * 2D / 3D city map preference.
 *
 * The 3D city is the default view. A choice the user made is kept in
 * localStorage so it survives reloads and always wins over the default. Storage
 * can be missing or throw (private windows, blocked site data, previews), so
 * every access is guarded; a browser without WebGL always gets the 2D canvas.
 *
 * This module must stay free of three.js imports: the 2D path loads it.
 */
export type MapViewMode = "2d" | "3d"

export const MAP_VIEW_STORAGE_KEY = "agentic-city:map-view"
export const DEFAULT_MAP_VIEW: MapViewMode = "3d"
/** The view that always works (no WebGL needed). */
export const FALLBACK_MAP_VIEW: MapViewMode = "2d"
export const MAP_VIEW_MODES: readonly MapViewMode[] = ["2d", "3d"]

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "setItem">

/** A stored value as a known mode, or null when nothing valid was saved. */
export function parseMapViewMode(value: unknown): MapViewMode | null {
  return value === "3d" || value === "2d" ? value : null
}

export interface ResolvedMapView {
  mode: MapViewMode
  /** True when the user explicitly chose 3D but this browser cannot show it. */
  webglMissing: boolean
}

/**
 * Picks the view to show: the saved choice when there is one, the 3D default
 * otherwise, and the 2D map whenever WebGL is missing.
 */
export function resolveMapView(saved: MapViewMode | null, hasWebGL: boolean): ResolvedMapView {
  const wanted = saved ?? DEFAULT_MAP_VIEW
  if (wanted === "3d" && !hasWebGL) return { mode: FALLBACK_MAP_VIEW, webglMissing: saved === "3d" }
  return { mode: wanted, webglMissing: false }
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

/** The saved choice, or null when nothing (valid) is saved or storage is unavailable. */
export function readMapViewMode(storage: ReadableStorage | null | undefined): MapViewMode | null {
  if (!storage) return null
  try {
    return parseMapViewMode(storage.getItem(MAP_VIEW_STORAGE_KEY))
  } catch {
    return null
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
