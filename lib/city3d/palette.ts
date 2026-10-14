import { mixHex } from "./colors"

/**
 * Shared palette of the low-poly 3D city: a neutral slate and navy base, a dusk
 * sky and a violet haze. District accents come from the districts themselves
 * (lib/data.ts DISTRICTS colors), so this file holds only the neutral tones.
 */

/** Sky dome stops, from the zenith down to just below the horizon. */
export const SKY_ZENITH = "#0c1640"
export const SKY_HIGH = "#1f2d72"
export const SKY_HORIZON = "#6f55c2"
export const SKY_BELOW = "#3b3580"

/** Haze over far water, land and the skyline ring; close to the horizon so they melt into it. */
export const FOG_COLOR = "#3e3a86"

/** Street plate, roads and lane markings. */
export const PLATE_TONES = ["#3f5482", "#44598a", "#3a4f7c", "#475d8e"] as const
export const PLATE_SIDE = "#2c3d66"
export const ROAD_COLOR = "#222d4d"
export const LANE_COLOR = "#fde68a"
export const PLATE_EDGE = "#67e8f9"

/** Harbor water and the shore land around it. */
export const WATER_COLOR = "#2d5598"
export const WATER_GLOW = "#101e4a"
export const SHORE_TONES = ["#2f3f6e", "#34467a", "#2b3a66", "#394c80", "#30416f"] as const

/** Island tops, plazas and facades. */
export const ISLAND_TOP = "#4a5d8a"
export const PLAZA_COLOR = "#61749f"
export const FACADE_TONES = ["#43537a", "#4b5c86", "#3d4c72", "#52648f"] as const
export const ROOF_COLOR = "#6b7ba3"
export const MAST_COLOR = "#334155"

/** Lights: a sky and ground fill, a warm key light and a cool rim light. */
export const LIGHTS = {
  hemisphereSky: "#c7d2fe",
  hemisphereGround: "#40306e",
  hemisphereIntensity: 1.9,
  ambientIntensity: 0.35,
  key: "#ffe1b8",
  keyIntensity: 2.8,
  keyPosition: [-22, 40, 26] as const,
  rim: "#93c5fd",
  rimIntensity: 1.4,
  rimPosition: [26, 18, -32] as const,
} as const

/**
 * Sky color for a direction `elevation` (sine of the angle above the horizon,
 * from -1 straight down to 1 straight up): violet at the horizon, deep blue overhead.
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
