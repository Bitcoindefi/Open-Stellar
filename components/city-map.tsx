"use client"

import dynamic from "next/dynamic"
import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from "react"
import { PixelCity, type PixelCityProps } from "@/components/pixel-city"
import { MapViewToggle } from "@/components/city3d/map-view-toggle"
import {
  DEFAULT_MAP_VIEW,
  FALLBACK_MAP_VIEW,
  detectWebGL,
  getBrowserStorage,
  hasRecent3DFailure,
  readMapViewMode,
  resolveMapView,
  writeMap3DFailure,
  writeMapViewMode,
  type MapViewMode,
} from "@/lib/city3d/view-mode"

// three.js, react-three-fiber and drei live in their own chunk, loaded on the
// client only: server rendering and the 2D map never pull them in.
const City3DView = dynamic(() => import("@/components/city3d/city-3d-view"), {
  ssr: false,
  loading: () => <CityMapLoading />,
})

const WEBGL_UNAVAILABLE = "3D view needs WebGL, which this browser does not provide. Showing the 2D map."
const WEBGL_FAILED = "The 3D view could not start on this device. Showing the 2D map."
const NOTICE_MS = 6000

/**
 * Light dusk placeholder shown while the view is picked and the 3D chunk loads,
 * in the same tones as the 3D sky so the switch to the scene never flashes dark.
 */
function CityMapLoading() {
  return (
    <div
      role="status"
      data-testid="city-map-loading"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(180deg, #8fb0ee 0%, #c9c6f2 55%, #e9d9f3 100%)",
        color: "#1e3a8a",
        fontFamily: "var(--font-pixel), monospace",
        fontSize: 10,
        letterSpacing: 1,
      }}
    >
      Loading city...
    </div>
  )
}

interface BoundaryProps {
  onError: () => void
  children: ReactNode
}

/** Catches a 3D crash (lost or refused WebGL context, chunk load failure) so the map can fall back to 2D. */
class City3DBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn("[city-3d] falling back to the 2D map", error, info.componentStack)
    this.props.onError()
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * City map: the low-poly 3D city by default, with the 2D pixel canvas one click
 * away. A choice the user makes is remembered per browser and wins over the
 * default; without WebGL, or if the 3D view fails, the 2D map takes over.
 * Sidebar, chat and wallet live outside and keep working in both views because
 * selection goes through the same callback.
 */
export function CityMap(props: PixelCityProps) {
  // null until the view is picked after hydration, so server and first client render match.
  const [mode, setMode] = useState<MapViewMode | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const storage = getBrowserStorage()
    const saved = readMapViewMode(storage)
    const failedRecently = hasRecent3DFailure(storage, Date.now())
    // Probe WebGL only when the 3D view is wanted (the probe creates a context).
    const needsWebGL = (saved ?? (failedRecently ? FALLBACK_MAP_VIEW : DEFAULT_MAP_VIEW)) === "3d"
    const resolved = resolveMapView(saved, needsWebGL && detectWebGL(), failedRecently)
    if (resolved.webglMissing) {
      setNotice(WEBGL_UNAVAILABLE)
      writeMapViewMode(storage, FALLBACK_MAP_VIEW)
    }
    setMode(resolved.mode)
  }, [])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(id)
  }, [notice])

  const changeMode = useCallback((next: MapViewMode) => {
    if (next === "3d" && !detectWebGL()) {
      setNotice(WEBGL_UNAVAILABLE)
      return
    }
    setNotice(null)
    setMode(next)
    writeMapViewMode(getBrowserStorage(), next)
  }, [])

  const handle3DFailure = useCallback(() => {
    setMode(FALLBACK_MAP_VIEW)
    setNotice(WEBGL_FAILED)
    // Remembered apart from the user's choice and only for a while, so a GPU that
    // cannot run the scene does not retry on every visit, while a one-off failure
    // (network blip, stale chunk after a deploy) does not keep 3D away for good.
    writeMap3DFailure(getBrowserStorage(), Date.now())
  }, [])

  const toggle = mode ? <MapViewToggle mode={mode} onChange={changeMode} /> : null

  return (
    <>
      {mode === null ? (
        <CityMapLoading />
      ) : mode === "3d" ? (
        <City3DBoundary onError={handle3DFailure}>
          <City3DView {...props} viewToggle={toggle} />
        </City3DBoundary>
      ) : (
        <PixelCity {...props} extraControls={toggle} />
      )}
      {notice && (
        <div
          role="status"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 20,
            maxWidth: "min(420px, calc(100% - 32px))",
            padding: "8px 12px",
            border: "1px solid #1e293b",
            borderRadius: 8,
            background: "rgba(15,23,42,0.95)",
            color: "#e2e8f0",
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.5,
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {notice}
        </div>
      )}
    </>
  )
}
