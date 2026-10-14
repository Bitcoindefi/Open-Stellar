import { describe, expect, it } from "vitest"
import { hexToRgb } from "./colors"
import * as palette from "./palette"

const luminance = (hex: string) => {
  const c = hexToRgb(hex)!
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
}

describe("palette", () => {
  it("only holds valid hex colors", () => {
    for (const [name, value] of Object.entries(palette)) {
      if (typeof value === "string") expect(hexToRgb(value), name).not.toBeNull()
      if (Array.isArray(value)) for (const v of value) expect(hexToRgb(v), name).not.toBeNull()
    }
  })

  it("fades the sky from clear blue overhead to a pale lavender at the horizon", () => {
    expect(palette.skyColorAt(1)).toBe(palette.SKY_ZENITH)
    expect(palette.skyColorAt(0)).toBe(palette.SKY_HORIZON)
    expect(luminance(palette.skyColorAt(0))).toBeGreaterThan(luminance(palette.skyColorAt(0.5)))
    expect(luminance(palette.skyColorAt(0.5))).toBeGreaterThan(luminance(palette.skyColorAt(1)))
    expect(palette.skyColorAt(-1)).toBe(palette.SKY_BELOW)
    expect(palette.skyColorAt(5)).toBe(palette.skyColorAt(1))
  })

  it("keeps the city bright: a daylight sky and haze, light ground, water and buildings", () => {
    expect(luminance(palette.SKY_HORIZON)).toBeGreaterThan(190)
    expect(luminance(palette.SKY_ZENITH)).toBeGreaterThan(100)
    expect(luminance(palette.FOG_COLOR)).toBeGreaterThan(180)
    for (const tone of [...palette.PLATE_TONES, ...palette.SHORE_TONES, ...palette.FACADE_TONES]) {
      expect(luminance(tone)).toBeGreaterThan(140)
    }
    expect(luminance(palette.ISLAND_TOP)).toBeGreaterThan(170)
    expect(luminance(palette.WATER_COLOR)).toBeGreaterThan(130)
    expect(palette.EXPOSURE).toBeGreaterThanOrEqual(1)
  })

  it("mutes an accent toward night navy", () => {
    expect(luminance(palette.muteAccent("#22d3ee"))).toBeLessThan(luminance("#22d3ee"))
    expect(palette.muteAccent("#22d3ee", 0)).toBe("#22d3ee")
  })
})
