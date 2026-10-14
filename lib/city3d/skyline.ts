import type { BoxInstance, GlowInstance } from "./buildings"
import { mixHex } from "./colors"
import { FACADE_TONES, MAST_COLOR, ROOF_COLOR, muteAccent } from "./palette"
import { createRng, hashString } from "./paths"
import { PLATE_TOP, harborPoint, type HarborLayout } from "./terrain"

/**
 * Ring of low-poly towers on the shore around the harbor, so the horizon is
 * made of 3D city instead of a picture. Two rows: low blocks near the beach,
 * taller towers behind them. Pure data; components/city3d/skyline-ring.tsx
 * instances it.
 */

export interface SkylineRow {
  /** Towers in this row. */
  count: number
  /** Radial position as multiples of the harbor ellipse. */
  scale: [number, number]
  height: [number, number]
  footprint: [number, number]
}

export const SKYLINE_ROWS: readonly SkylineRow[] = [
  { count: 64, scale: [1.12, 1.22], height: [1.6, 4.5], footprint: [1.4, 2.4] },
  { count: 76, scale: [1.3, 1.6], height: [5, 15], footprint: [1.8, 3.2] },
]

const FLOOR = 1.05
const STRIP = 0.16
const STRIP_DEPTH = 0.05

export interface SkylineRing {
  towers: BoxInstance[]
  windows: GlowInstance[]
  beacons: GlowInstance[]
}

/** Four window bands around a block from `bottom` to `top`, skipping a few floors for variety. */
function bandsAround(
  x: number,
  z: number,
  width: number,
  depth: number,
  bottom: number,
  top: number,
  color: string,
  rng: () => number,
  out: GlowInstance[],
): void {
  for (let y = bottom + 1.1; y < top - 0.35; y += FLOOR) {
    if (rng() < 0.22) continue
    const fx = width * 0.82
    const fz = depth * 0.82
    out.push(
      { x, y, z: z + depth / 2 + STRIP_DEPTH / 2, sx: fx, sy: STRIP, sz: STRIP_DEPTH, color },
      { x: x + width / 2 + STRIP_DEPTH / 2, y, z, sx: STRIP_DEPTH, sy: STRIP, sz: fz, color },
      { x, y, z: z - depth / 2 - STRIP_DEPTH / 2, sx: fx, sy: STRIP, sz: STRIP_DEPTH, color },
      { x: x - width / 2 - STRIP_DEPTH / 2, y, z, sx: STRIP_DEPTH, sy: STRIP, sz: fz, color },
    )
  }
}

/**
 * Towers around the harbor in muted district accents. `accents` is the list of
 * district colors; an empty list falls back to a cool cyan.
 */
export function buildSkylineRing(
  harbor: HarborLayout,
  accents: readonly string[],
  rows: readonly SkylineRow[] = SKYLINE_ROWS,
  seed = "skyline-ring",
): SkylineRing {
  const rng = createRng(hashString(seed))
  const palette = accents.length > 0 ? accents.map((a) => muteAccent(a)) : [muteAccent("#22d3ee")]
  const ring: SkylineRing = { towers: [], windows: [], beacons: [] }
  // Sunk a little so no tower floats over a dip in the shore.
  const ground = PLATE_TOP - 0.5

  rows.forEach((row, rowIndex) => {
    for (let i = 0; i < row.count; i++) {
      const angle = ((i + rng() * 0.7) / row.count) * Math.PI * 2 + rowIndex * 0.37
      const scale = row.scale[0] + rng() * (row.scale[1] - row.scale[0])
      const height = row.height[0] + Math.pow(rng(), 1.3) * (row.height[1] - row.height[0])
      const width = row.footprint[0] + rng() * (row.footprint[1] - row.footprint[0])
      const depth = row.footprint[0] + rng() * (row.footprint[1] - row.footprint[0])
      const setbackRoll = rng()
      const roofRoll = rng()
      const accent = palette[Math.floor(rng() * palette.length) % palette.length]
      const facade = mixHex(FACADE_TONES[i % FACADE_TONES.length], "#1e1b4b", 0.18)
      const { x, z } = harborPoint(harbor, angle, scale)

      const hasSetback = height > 6 && setbackRoll < 0.6
      const split = hasSetback ? height * (0.5 + setbackRoll * 0.3) : height
      ring.towers.push({ x, y: ground + split / 2, z, sx: width, sy: split, sz: depth, color: facade })
      bandsAround(x, z, width, depth, ground, ground + split, accent, rng, ring.windows)
      let top = ground + split
      let topW = width
      let topD = depth
      if (hasSetback) {
        topW = width * 0.62
        topD = depth * 0.62
        const upper = height - split + 1.2
        ring.towers.push({ x, y: top + upper / 2, z, sx: topW, sy: upper, sz: topD, color: facade })
        bandsAround(x, z, topW, topD, top, top + upper, accent, rng, ring.windows)
        top += upper
      }
      if (roofRoll < 0.3) {
        ring.towers.push({ x, y: top + 0.4, z, sx: topW, sy: 0.8, sz: topD, color: mixHex(ROOF_COLOR, "#1e1b4b", 0.2), shape: "pyramid" })
      } else if (roofRoll < 0.55 && height > 5) {
        ring.towers.push({ x, y: top + 0.9, z, sx: 0.12, sy: 1.8, sz: 0.12, color: MAST_COLOR, shape: "cylinder" })
        ring.beacons.push({ x, y: top + 1.9, z, sx: 0.32, sy: 0.32, sz: 0.32, color: accent, shape: "octahedron", blink: i % 2 === 0 ? 1 : 2 })
      } else {
        ring.towers.push({ x, y: top + 0.06, z, sx: topW * 1.06, sy: 0.12, sz: topD * 1.06, color: mixHex(ROOF_COLOR, "#1e1b4b", 0.25) })
      }
    }
  })
  return ring
}
