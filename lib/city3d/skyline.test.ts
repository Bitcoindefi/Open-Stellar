import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/lib/data"
import { buildIslandLayouts } from "./layout"
import { muteAccent } from "./palette"
import { SKYLINE_ROWS, buildSkylineRing } from "./skyline"
import { getGroundLayout, getHarborLayout } from "./terrain"

const islands = buildIslandLayouts(DISTRICTS)
const harbor = getHarborLayout(getGroundLayout(islands))
const accents = islands.map((island) => island.color)

describe("buildSkylineRing", () => {
  const ring = buildSkylineRing(harbor, accents)

  it("is deterministic", () => {
    expect(buildSkylineRing(harbor, accents)).toEqual(ring)
  })

  it("stands every tower on the shore, outside the harbor water", () => {
    const minScale = Math.min(...SKYLINE_ROWS.map((row) => row.scale[0]))
    for (const tower of ring.towers) {
      const r = Math.hypot((tower.x - harbor.center.x) / harbor.rx, (tower.z - harbor.center.z) / harbor.rz)
      expect(r).toBeGreaterThanOrEqual(minScale - 1e-6)
    }
  })

  it("has at least one tower per row slot and taller towers in the back row", () => {
    const total = SKYLINE_ROWS.reduce((n, row) => n + row.count, 0)
    expect(ring.towers.length).toBeGreaterThanOrEqual(total)
    const tallest = Math.max(...ring.towers.map((t) => t.y + t.sy / 2))
    expect(tallest).toBeGreaterThan(SKYLINE_ROWS[0].height[1])
  })

  it("lights windows in muted district accents and blinks the beacons", () => {
    const muted = new Set(accents.map((a) => muteAccent(a)))
    expect(ring.windows.length).toBeGreaterThan(ring.towers.length)
    for (const w of ring.windows) expect(muted.has(w.color)).toBe(true)
    expect(ring.beacons.length).toBeGreaterThan(0)
    for (const b of ring.beacons) expect(b.blink).toBeGreaterThan(0)
  })

  it("falls back to one accent without districts", () => {
    const fallback = buildSkylineRing(harbor, [])
    expect(new Set(fallback.windows.map((w) => w.color)).size).toBe(1)
  })
})
