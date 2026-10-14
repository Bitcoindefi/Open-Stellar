"use client"

import { useLayoutEffect, useState, type RefObject } from "react"
import type { ViewportInsets } from "@/lib/city3d/layout"
import {
  NARROW_MAP_WIDTH,
  computeOverlayInsets,
  parseOverlaySide,
  sameInsets,
  type OverlayRect,
} from "@/lib/city3d/overlays"

/** Settle time after a layout change before overlays are measured again. */
const MEASURE_DELAY_MS = 120

/**
 * Measures how much of the map the `data-map-overlay` elements cover, on mount
 * and whenever the map or the window resizes. `insets` stays null until the
 * first measurement, so the camera waits for it before framing the city.
 */
export function useOverlayInsets(containerRef: RefObject<HTMLElement | null>): {
  insets: ViewportInsets | null
  narrow: boolean
} {
  const [insets, setInsets] = useState<ViewportInsets | null>(null)
  const [narrow, setNarrow] = useState(false)

  // Layout effect: the narrow layout is known before the first paint (this module is client-only).
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    let timer: number | undefined

    const measure = () => {
      const box = container.getBoundingClientRect()
      const overlays: OverlayRect[] = []
      for (const element of document.querySelectorAll<HTMLElement>("[data-map-overlay]")) {
        const side = parseOverlaySide(element.dataset.mapOverlay)
        if (!side) continue
        const rect = element.getBoundingClientRect()
        overlays.push({ side, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
      }
      const next = computeOverlayInsets(box, overlays)
      setNarrow(box.width < NARROW_MAP_WIDTH)
      setInsets((current) => (sameInsets(current, next) ? current : next))
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, MEASURE_DELAY_MS)
    }

    // First pass right away (narrow layout), second once overlays have re-laid out.
    setNarrow(container.getBoundingClientRect().width < NARROW_MAP_WIDTH)
    schedule()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    observer?.observe(container)
    window.addEventListener("resize", schedule)
    return () => {
      window.clearTimeout(timer)
      observer?.disconnect()
      window.removeEventListener("resize", schedule)
    }
  }, [containerRef])

  return { insets, narrow }
}
