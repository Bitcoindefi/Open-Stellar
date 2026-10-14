import { mixHex } from "./colors"

/**
 * Shared palette of the low-poly 3D city: a light blue-violet base under a
 * bright dusk sky (clear blue overhead, a soft lavender and peach horizon) and
 * a pale haze, so the city reads as early evening, not night. District accents
 * come from the districts themselves (lib/data.ts DISTRICTS colors), so this
 * file holds only the neutral tones.
 */

/** Sky dome stops, from the zenith down to just below the horizon. */
export const SKY_ZENITH = "#4a78d0"
export const SKY_HIGH = "#86a6ea"
export const SKY_HORIZON = "#ead2ee"
export const SKY_BELOW = "#c4b5ea"

/** Haze over far water, land and the skyline ring; close to the horizon so they melt into it. */
export const FOG_COLOR = "#cdc3ef"

/** Street plate, roads and lane markings. */
export const PLATE_TONES = ["#9aa7cf", "#a2afd6", "#93a1c9", "#a8b4da"] as const
export const PLATE_SIDE = "#7684b0"
export const ROAD_COLOR = "#5d6993"
export const LANE_COLOR = "#fde68a"
export const PLATE_EDGE = "#22d3ee"

/** Harbor water and the shore land around it. */
export const WATER_COLOR = "#4fa8e0"
export const WATER_GLOW = "#173f6e"
export const SHORE_TONES = ["#93b6cf", "#9cbed6", "#8aadc8", "#a5c5db", "#96b9d2"] as const

/** Island tops, plazas and facades. */
export const ISLAND_TOP = "#aab7da"
export const PLAZA_COLOR = "#c2cde8"
export const FACADE_TONES = ["#9aa7cf", "#a6b2d8", "#8f9dc6", "#b0bcdf"] as const
export const ROOF_COLOR = "#cdd6ee"
export const MAST_COLOR = "#64748b"

/** Renderer exposure (ACES tone mapping): a touch over 1 for a bright, airy scene. */
export const EXPOSURE = 1.12

/** Lights: a sky and ground fill, a warm key light and a cool rim light. */
export const LIGHTS = {
  hemisphereSky: "#e0e7ff",
  hemisphereGround: "#8d82c8",
  hemisphereIntensity: 2.3,
  ambientIntensity: 0.55,
  key: "#ffe6c4",
  keyIntensity: 3.1,
  keyPosition: [-22, 40, 26] as const,
  rim: "#bfdbfe",
  rimIntensity: 1.3,
  rimPosition: [26, 18, -32] as const,
} as const

/**
 * Sky color for a direction `elevation` (sine of the angle above the horizon,
 * from -1 straight down to 1 straight up): pale lavender at the horizon, clear blue overhead.
 */
export function skyColorAt(elevation: number): string {
  const e = Math.min(1, Math.max(-1, elevation))
  if (e <= 0) return mixHex(SKY_HORIZON, SKY_BELOW, Math.min(1, -e * 4))
  if (e < 0.35) return mixHex(SKY_HORIZON, SKY_HIGH, e / 0.35)
  return mixHex(SKY_HIGH, SKY_ZENITH, (e - 0.35) / 0.65)
}

/** A district accent pulled toward night navy, for distant window strips. */
export function muteAccent(accent: string, amount = 0.35): string {
  return mixHex(accent, "#0b1026", amount)
}
