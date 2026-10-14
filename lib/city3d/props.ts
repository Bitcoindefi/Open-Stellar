import type { DistrictId } from "@/lib/types"
import { getFreeLots, type BoxInstance, type GlowInstance, type Lot } from "./buildings"
import { mixHex } from "./colors"
import type { IslandLayout } from "./layout"
import { MAST_COLOR } from "./palette"

/**
 * Small low-poly props that tell the districts apart: server racks in the Data
 * Center, dishes and masts in the Comm Hub, conveyors and crates in Processing,
 * shield pylons and turrets in the Defense Grid, domes and telescopes in the
 * Research Lab. Built from the same unit parts as the buildings, so they are
 * instanced with them.
 */

export interface PropParts {
  solid: BoxInstance[]
  glow: GlowInstance[]
}

/** Props per island at most; they take the free lots closest to the plaza. */
export const PROPS_PER_ISLAND = 5

type PropBuilder = (x: number, z: number, accent: string, index: number, out: PropParts) => void

const DARK_METAL = "#4b5a82"
const STEEL = "#7b8cb6"
const LIGHT_SHELL = "#c7d2e8"

const serverRacks: PropBuilder = (x, z, accent, index, out) => {
  for (const dx of [-0.27, 0.27]) {
    out.solid.push({ x: x + dx, y: 0.55, z, sx: 0.44, sy: 1.1, sz: 0.56, color: DARK_METAL })
    out.solid.push({ x: x + dx, y: 1.13, z, sx: 0.48, sy: 0.06, sz: 0.6, color: STEEL })
    for (let row = 0; row < 3; row++) {
      const blink = (row + index + (dx > 0 ? 1 : 0)) % 3 === 0 ? 0 : (((row + index) % 2) + 1) as 1 | 2
      out.glow.push({ x: x + dx, y: 0.3 + row * 0.27, z: z + 0.29, sx: 0.32, sy: 0.05, sz: 0.02, color: accent, blink })
      out.glow.push({ x: x + dx, y: 0.3 + row * 0.27, z: z - 0.29, sx: 0.32, sy: 0.05, sz: 0.02, color: accent, blink })
    }
  }
}

const dishAndMast: PropBuilder = (x, z, accent, index, out) => {
  const turn = index * 1.3
  out.solid.push({ x: x - 0.2, y: 0.15, z, sx: 0.5, sy: 0.3, sz: 0.5, color: STEEL, shape: "cylinder" })
  out.solid.push({ x: x - 0.2, y: 0.5, z, sx: 0.12, sy: 0.5, sz: 0.12, color: MAST_COLOR, shape: "cylinder" })
  out.solid.push({ x: x - 0.2, y: 0.85, z, sx: 0.95, sy: 0.22, sz: 0.95, color: LIGHT_SHELL, shape: "dish", rx: -0.65, ry: turn })
  out.glow.push({ x: x - 0.2 + Math.sin(turn) * 0.22, y: 1.2, z: z + Math.cos(turn) * 0.22, sx: 0.12, sy: 0.12, sz: 0.12, color: accent, shape: "octahedron" })
  out.solid.push({ x: x + 0.42, y: 1.0, z: z - 0.25, sx: 0.16, sy: 2, sz: 0.16, color: MAST_COLOR, shape: "cone" })
  out.solid.push({ x: x + 0.42, y: 0.55, z: z - 0.25, sx: 0.42, sy: 0.05, sz: 0.42, color: STEEL, shape: "cylinder" })
  out.glow.push({ x: x + 0.42, y: 2.05, z: z - 0.25, sx: 0.16, sy: 0.16, sz: 0.16, color: accent, shape: "octahedron", blink: index % 2 === 0 ? 1 : 2 })
}

const conveyor: PropBuilder = (x, z, accent, index, out) => {
  const crate = index % 2 === 0 ? "#b45309" : "#a16207"
  out.solid.push({ x, y: 0.42, z, sx: 1.25, sy: 0.12, sz: 0.4, color: DARK_METAL })
  for (const dx of [-0.5, 0.5]) out.solid.push({ x: x + dx, y: 0.18, z, sx: 0.1, sy: 0.36, sz: 0.34, color: STEEL })
  out.glow.push({ x, y: 0.42, z: z + 0.21, sx: 1.2, sy: 0.04, sz: 0.02, color: accent })
  out.solid.push({ x: x - 0.3, y: 0.62, z, sx: 0.28, sy: 0.28, sz: 0.28, color: crate, ry: 0.2 })
  out.solid.push({ x: x + 0.25, y: 0.62, z, sx: 0.28, sy: 0.28, sz: 0.28, color: crate, ry: -0.3 })
  // A crate pile beside the belt.
  out.solid.push({ x: x + 0.1, y: 0.18, z: z + 0.5, sx: 0.36, sy: 0.36, sz: 0.36, color: "#92400e" })
  out.solid.push({ x: x + 0.48, y: 0.18, z: z + 0.5, sx: 0.36, sy: 0.36, sz: 0.36, color: crate, ry: 0.4 })
  out.solid.push({ x: x + 0.28, y: 0.52, z: z + 0.5, sx: 0.32, sy: 0.32, sz: 0.32, color: "#c2410c", ry: 0.8 })
}

const pylonAndTurret: PropBuilder = (x, z, accent, index, out) => {
  out.solid.push({ x: x - 0.3, y: 0.1, z, sx: 0.6, sy: 0.2, sz: 0.6, color: DARK_METAL })
  out.solid.push({ x: x - 0.3, y: 0.85, z, sx: 0.28, sy: 1.3, sz: 0.28, color: STEEL, shape: "cone" })
  out.glow.push({ x: x - 0.3, y: 1.62, z, sx: 0.3, sy: 0.38, sz: 0.3, color: accent, shape: "octahedron", blink: index % 2 === 0 ? 1 : 2 })
  out.glow.push({ x: x - 0.3, y: 0.22, z, sx: 0.66, sy: 0.04, sz: 0.66, color: accent, shape: "cylinder" })
  const aim = 0.6 + index * 0.9
  out.solid.push({ x: x + 0.35, y: 0.15, z: z + 0.1, sx: 0.5, sy: 0.3, sz: 0.5, color: STEEL, shape: "cylinder" })
  out.solid.push({ x: x + 0.35, y: 0.42, z: z + 0.1, sx: 0.38, sy: 0.24, sz: 0.38, color: DARK_METAL, ry: aim })
  out.solid.push({
    x: x + 0.35 + Math.sin(aim) * 0.32,
    y: 0.47,
    z: z + 0.1 + Math.cos(aim) * 0.32,
    sx: 0.07,
    sy: 0.07,
    sz: 0.42,
    color: MAST_COLOR,
    ry: aim,
  })
}

const domeAndTelescope: PropBuilder = (x, z, accent, index, out) => {
  out.solid.push({ x: x - 0.12, y: 0.28, z, sx: 1.05, sy: 0.56, sz: 1.05, color: LIGHT_SHELL, shape: "dome" })
  out.glow.push({ x: x - 0.12, y: 0.03, z, sx: 1.12, sy: 0.05, sz: 1.12, color: accent, shape: "cylinder" })
  out.glow.push({ x: x - 0.12, y: 0.5, z: z + 0.2, sx: 0.08, sy: 0.08, sz: 0.08, color: accent, shape: "octahedron", blink: index % 2 === 0 ? 1 : 2 })
  out.solid.push({ x: x + 0.45, y: 0.12, z: z + 0.35, sx: 0.3, sy: 0.24, sz: 0.3, color: STEEL })
  out.solid.push({ x: x + 0.5, y: 0.5, z: z + 0.3, sx: 0.16, sy: 0.75, sz: 0.16, color: mixHex(LIGHT_SHELL, accent, 0.25), shape: "cylinder", rx: -0.6, rz: -0.35 })
}

export const DISTRICT_PROPS: Record<DistrictId, PropBuilder> = {
  "data-center": serverRacks,
  "comm-hub": dishAndMast,
  processing: conveyor,
  defense: pylonAndTurret,
  research: domeAndTelescope,
}

export function getPropBuilder(id: string): PropBuilder {
  return Object.prototype.hasOwnProperty.call(DISTRICT_PROPS, id) ? DISTRICT_PROPS[id as DistrictId] : serverRacks
}

/** The lots each island's props stand on (free lots nearest the plaza). */
export function getPropLots(island: IslandLayout, limit = PROPS_PER_ISLAND): Lot[] {
  return getFreeLots(island).slice(0, limit)
}

/** Every district's props as instanced parts. */
export function buildDistrictProps(islands: readonly IslandLayout[], limit = PROPS_PER_ISLAND): PropParts {
  const out: PropParts = { solid: [], glow: [] }
  for (const island of islands) {
    const build = getPropBuilder(island.id)
    getPropLots(island, limit).forEach((lot, index) => build(lot.x, lot.z, island.color, index, out))
  }
  return out
}
