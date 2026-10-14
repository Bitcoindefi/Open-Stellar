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

  it("fades the sky from deep blue overhead to a brighter violet at the horizon", () => {
    expect(palette.skyColorAt(1)).toBe(palette.SKY_ZENITH)
    expect(palette.skyColorAt(0)).toBe(palette.SKY_HORIZON)
    expect(luminance(palette.skyColorAt(0))).toBeGreaterThan(luminance(palette.skyColorAt(0.5)))
    expect(luminance(palette.skyColorAt(0.5))).toBeGreaterThan(luminance(palette.skyColorAt(1)))
    expect(palette.skyColorAt(-1)).toBe(palette.SKY_BELOW)
    expect(palette.skyColorAt(5)).toBe(palette.skyColorAt(1))
  })

  it("mutes an accent toward night navy", () => {
    expect(luminance(palette.muteAccent("#22d3ee"))).toBeLessThan(luminance("#22d3ee"))
    expect(palette.muteAccent("#22d3ee", 0)).toBe("#22d3ee")
  })
})
