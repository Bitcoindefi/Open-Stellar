"use client"

import { MAP_VIEW_MODES, type MapViewMode } from "@/lib/city3d/view-mode"

interface MapViewToggleProps {
  mode: MapViewMode
  onChange: (mode: MapViewMode) => void
}

const LABELS: Record<MapViewMode, string> = {
  "2d": "2D pixel map",
  "3d": "3D city view",
}

/**
 * 2D / 3D switch that sits at the end of the map control bar (both views render
 * it). A pair of toggle buttons so screen readers announce which view is on.
 */
export function MapViewToggle({ mode, onChange }: MapViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Map view"
      style={{ display: "flex", gap: 2, marginLeft: 1, paddingLeft: 5, borderLeft: "1px solid rgba(148,163,184,0.22)" }}
    >
      {MAP_VIEW_MODES.map((option) => {
        const active = option === mode
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            aria-label={LABELS[option]}
            title={LABELS[option]}
            data-map-view={option}
            onClick={() => {
              if (!active) onChange(option)
            }}
            style={{
              height: 34,
              minWidth: 34,
              padding: "0 6px",
              display: "grid",
              placeItems: "center",
              border: active ? "1px solid #22d3ee88" : "1px solid transparent",
              borderRadius: 7,
              background: active ? "rgba(8,47,73,0.8)" : "transparent",
              color: active ? "#67e8f9" : "#cbd5e1",
              fontFamily: "var(--font-pixel), monospace",
              fontSize: 9,
              letterSpacing: 0.5,
              cursor: active ? "default" : "pointer",
            }}
          >
            {option.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
