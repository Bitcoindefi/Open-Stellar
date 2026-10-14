import { describe, expect, it } from "vitest"
import { DISTRICTS } from "@/lib/data"
import { generateBuildings } from "./buildings"
import { buildIslandLayouts, isInsideRect } from "./layout"
import { DISTRICT_PROPS, PROPS_PER_ISLAND, buildDistrictProps, getPropBuilder, getPropLots } from "./props"

const islands = buildIslandLayouts(DISTRICTS)

describe("district props", () => {
  it("has a prop builder per district and a fallback", () => {
    for (const district of DISTRICTS) expect(getPropBuilder(district.id)).toBe(DISTRICT_PROPS[district.id])
    expect(typeof getPropBuilder("unknown")).toBe("function")
  })

  it("puts a few props on every island, off the plaza and off the buildings", () => {
    for (const island of islands) {
      const lots = getPropLots(island)
      expect(lots.length).toBeGreaterThan(0)
      expect(lots.length).toBeLessThanOrEqual(PROPS_PER_ISLAND)
      const buildings = generateBuildings(island)
      for (const lot of lots) {
        expect(isInsideRect(lot, island.walkArea)).toBe(false)
        expect(isInsideRect(lot, island.bounds)).toBe(true)
        for (const b of buildings) expect(Math.hypot(b.x - lot.x, b.z - lot.z)).toBeGreaterThan(0.5)
      }
    }
  })

  it("builds solid and glowing parts in the district accent", () => {
    const props = buildDistrictProps(islands)
    expect(props.solid.length).toBeGreaterThan(islands.length * 3)
    expect(props.glow.length).toBeGreaterThan(islands.length)
    for (const island of islands) expect(props.glow.some((g) => g.color === island.color)).toBe(true)
    // Some lights blink (server racks, beacons), some hold steady.
    expect(props.glow.some((g) => (g.blink ?? 0) > 0)).toBe(true)
    expect(props.glow.some((g) => (g.blink ?? 0) === 0)).toBe(true)
    expect(buildDistrictProps(islands)).toEqual(props)
  })

  it("keeps every part above the island top", () => {
    const props = buildDistrictProps(islands)
    for (const part of [...props.solid, ...props.glow]) expect(part.y).toBeGreaterThanOrEqual(0)
  })
})
