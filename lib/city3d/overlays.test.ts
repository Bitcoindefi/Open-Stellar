import { describe, expect, it } from "vitest"
import { NARROW_MAP_WIDTH, WIDE_MAP_INSETS, computeOverlayInsets, parseOverlaySide, sameInsets } from "./overlays"

const phone = { left: 0, top: 0, right: 390, bottom: 712 }

describe("computeOverlayInsets", () => {
  it("measures how far top and bottom overlays reach into a narrow map", () => {
    const insets = computeOverlayInsets(phone, [
      { side: "top", left: 330, top: 14, right: 376, bottom: 50 },
      { side: "top", left: 160, top: 60, right: 376, bottom: 104 },
      { side: "bottom", left: 0, top: 585, right: 390, bottom: 844 },
      { side: "bottom", left: 290, top: 522, right: 376, bottom: 564 },
    ])
    expect(insets).toEqual({ top: 104, right: 0, bottom: 190, left: 0 })
  })

  it("ignores hidden overlays and overlays outside the map", () => {
    const insets = computeOverlayInsets(phone, [
      { side: "top", left: 10, top: 10, right: 10, bottom: 400 },
      { side: "bottom", left: 400, top: 300, right: 500, bottom: 700 },
      { side: "top", left: 0, top: 720, right: 390, bottom: 800 },
    ])
    expect(insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it("is relative to the map's own position on the page", () => {
    const map = { left: 0, top: 100, right: 300, bottom: 700 }
    expect(computeOverlayInsets(map, [{ side: "top", left: 0, top: 110, right: 100, bottom: 160 }]).top).toBe(60)
  })

  it("uses fixed corner insets on wide maps and nothing for an empty map", () => {
    const wide = { left: 0, top: 0, right: NARROW_MAP_WIDTH + 200, bottom: 800 }
    expect(computeOverlayInsets(wide, [{ side: "top", left: 0, top: 0, right: 900, bottom: 400 }])).toEqual(WIDE_MAP_INSETS)
    expect(computeOverlayInsets({ left: 0, top: 0, right: 0, bottom: 0 }, [])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})

describe("overlay helpers", () => {
  it("parses only known sides", () => {
    expect(parseOverlaySide("top")).toBe("top")
    expect(parseOverlaySide("bottom")).toBe("bottom")
    expect(parseOverlaySide("left")).toBeNull()
    expect(parseOverlaySide(undefined)).toBeNull()
  })

  it("compares insets by value", () => {
    expect(sameInsets({ top: 1, right: 0, bottom: 2, left: 0 }, { top: 1, right: 0, bottom: 2, left: 0 })).toBe(true)
    expect(sameInsets({ top: 1, right: 0, bottom: 2, left: 0 }, { top: 1, right: 0, bottom: 3, left: 0 })).toBe(false)
    expect(sameInsets(null, null)).toBe(true)
    expect(sameInsets(null, WIDE_MAP_INSETS)).toBe(false)
  })
})
