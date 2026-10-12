import { describe, expect, it } from "vitest"
import { desaturateHex, hexToRgb, mixHex, rgbToHex } from "./colors"

describe("hexToRgb / rgbToHex", () => {
  it("parses short and long hex colors", () => {
    expect(hexToRgb("#22d3ee")).toEqual({ r: 0x22, g: 0xd3, b: 0xee })
    expect(hexToRgb(" #fff ")).toEqual({ r: 255, g: 255, b: 255 })
  })

  it("rejects anything that is not a hex color", () => {
    expect(hexToRgb("red")).toBeNull()
    expect(hexToRgb("#12345")).toBeNull()
    expect(hexToRgb("")).toBeNull()
    expect(hexToRgb(null)).toBeNull()
    expect(hexToRgb(undefined)).toBeNull()
  })

  it("formats and clamps channels", () => {
    expect(rgbToHex({ r: 34, g: 211, b: 238 })).toBe("#22d3ee")
    expect(rgbToHex({ r: -5, g: 300, b: 7.6 })).toBe("#00ff08")
  })
})

describe("mixHex", () => {
  it("interpolates between two colors", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000")
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff")
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080")
    expect(mixHex("#000000", "#ffffff", 3)).toBe("#ffffff")
  })

  it("returns the first color for invalid input", () => {
    expect(mixHex("#123456", "nope", 0.5)).toBe("#123456")
    expect(mixHex("nope", "#123456", 0.5)).toBe("nope")
  })
})

describe("desaturateHex", () => {
  it("fully desaturates to gray", () => {
    const gray = hexToRgb(desaturateHex("#ff0000", 1))
    expect(gray?.r).toBe(gray?.g)
    expect(gray?.g).toBe(gray?.b)
  })

  it("can dim at the same time", () => {
    expect(desaturateHex("#808080", 0, 0.5)).toBe("#404040")
    expect(desaturateHex("#808080", 0, -1)).toBe("#000000")
  })

  it("keeps invalid input as is", () => {
    expect(desaturateHex("teal", 1)).toBe("teal")
  })
})
