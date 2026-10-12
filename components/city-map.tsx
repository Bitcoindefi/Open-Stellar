"use client"

import dynamic from "next/dynamic"
import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from "react"
import { PixelCity, type PixelCityProps } from "@/components/pixel-city"
import { MapViewToggle } from "@/components/city3d/map-view-toggle"
import {
  DEFAULT_MAP_VIEW,
  detectWebGL,
  getBrowserStorage,
  readMapViewMode,
  writeMapViewMode,
  type MapViewMode,
} from "@/lib/city3d/view-mode"

// three.js, react-three-fiber and drei only load when someone opens the 3D view:
// the 2D map and server rendering never pull them in.
const City3DView = dynamic(() => import("@/components/city3d/city-3d-view"), {
  ssr: false,
  loading: () => <City3DLoading />,
})

const WEBGL_UNAVAILABLE = "3D view needs WebGL, which this browser does not provide. Showing the 2D map."
const WEBGL_FAILED = "The 3D view could not start on this device. Showing the 2D map."
const NOTICE_MS = 6000

function City3DLoading() {
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#020617",
        color: "#67e8f9",
        fontFamily: "var(--font-pixel), monospace",
        fontSize: 10,
        letterSpacing: 1,
      }}
    >
      Loading 3D city...
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
 * City map with an opt-in 3D view. The 2D pixel canvas stays the default; the
 * choice is remembered per browser. Sidebar, chat and wallet live outside and
 * keep working in both views because selection goes through the same callback.
 */
export function CityMap(props: PixelCityProps) {
  const [mode, setMode] = useState<MapViewMode>(DEFAULT_MAP_VIEW)
  const [notice, setNotice] = useState<string | null>(null)

  // Restore the saved choice after hydration so server and first client render match.
  useEffect(() => {
    const saved = readMapViewMode(getBrowserStorage())
    if (saved !== "3d") return
    if (detectWebGL()) {
      setMode("3d")
    } else {
      setNotice(WEBGL_UNAVAILABLE)
      writeMapViewMode(getBrowserStorage(), "2d")
    }
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
    setMode("2d")
    setNotice(WEBGL_FAILED)
    writeMapViewMode(getBrowserStorage(), "2d")
  }, [])

  const toggle = <MapViewToggle mode={mode} onChange={changeMode} />

  return (
    <>
      {mode === "3d" ? (
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
