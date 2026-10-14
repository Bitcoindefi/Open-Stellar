"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Canvas } from "@react-three/fiber"
import { Html, PerformanceMonitor } from "@react-three/drei"
import { LocateFixed, Minus, Plus } from "lucide-react"
import type { PixelCityProps } from "@/components/pixel-city"
import { buildCityBlocks } from "@/lib/city3d/buildings"
import { EXPOSURE, FOG_COLOR, LIGHTS } from "@/lib/city3d/palette"
import { buildDistrictProps } from "@/lib/city3d/props"
import {
  CAMERA_FOV,
  buildIslandLayouts,
  getCityFrame,
  getFitPoints,
  type IslandLayout,
} from "@/lib/city3d/layout"
import { getInitialDpr, shouldAntialias, stepDpr } from "@/lib/city3d/quality"
import { computeDistrictFocus } from "@/lib/city3d/robot-state"
import { CameraRig, type CameraApi } from "./camera-rig"
import { CityBlocks } from "./city-blocks"
import { CityGround } from "./city-ground"
import { SkyDome, SkylineRing } from "./city-horizon"
import { disposePartGeometries } from "./instanced-parts"
import { RobotLayer } from "./robot-layer"
import { useOverlayInsets } from "./use-overlay-insets"

export interface City3DViewProps extends PixelCityProps {
  /** The 2D / 3D switch, rendered at the end of the control bar. */
  viewToggle?: ReactNode
}

/** Shown until the first frame is drawn: the haze color, so the switch never flashes. */
const BACKDROP_FALLBACK = FOG_COLOR
const ZOOM_STEP = 1.25

/**
 * Opt-in 3D view of the city (three.js via react-three-fiber). It replaces only
 * the map canvas: selection goes through the same `onSelectAgent` callback as
 * the 2D map, so the sidebar opens the same panel. Loaded with next/dynamic and
 * ssr: false, so none of this ships with the 2D path.
 */
export default function City3DView({
  agents,
  districts,
  selectedAgentId,
  onSelectAgent,
  colorBlindMode = false,
  reduceMotion = false,
  audioEngine,
  districtStandings = [],
  viewToggle,
}: City3DViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // District plates mount once the canvas is wired to its events container: a plate
  // mounted earlier (the first one in the tree) could keep an empty DOM root.
  const [sceneReady, setSceneReady] = useState(false)
  // Client-only module (next/dynamic, ssr: false), so window is available here.
  const [deviceDpr] = useState(() => window.devicePixelRatio || 1)
  const [dpr, setDpr] = useState(() => getInitialDpr(deviceDpr))
  const cameraApi = useRef<CameraApi | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { insets, narrow } = useOverlayInsets(containerRef)
  const frame = useMemo(() => getCityFrame(districts), [districts])
  const islands = useMemo(() => buildIslandLayouts(districts, frame), [districts, frame])
  const blocks = useMemo(() => buildCityBlocks(islands), [islands])
  const props = useMemo(() => buildDistrictProps(islands), [islands])
  const hasStandings = districtStandings.length > 0
  const fitPoints = useMemo(
    () => getFitPoints(islands, (island) => getLabelPad(island.name, hasStandings)),
    [islands, hasStandings],
  )

  useEffect(() => () => disposePartGeometries(), [])

  // District ambience follows agent presence, like the 2D map does.
  useEffect(() => {
    if (!audioEngine) return
    const volumes = computeDistrictFocus(agents, districts.map((d) => d.id))
    for (const [id, volume] of volumes) audioEngine.setDistrictFocus(id, volume)
  }, [agents, districts, audioEngine])

  const handleSelect = useCallback(
    (id: string) => {
      audioEngine?.init()
      onSelectAgent(id)
    },
    [audioEngine, onSelectAgent],
  )
  const handleHoverStart = useCallback((id: string) => setHoveredId(id), [])
  const handleHoverEnd = useCallback((id: string) => setHoveredId((current) => (current === id ? null : current)), [])

  const activeCount = agents.filter((agent) => agent.status === "working" || agent.status === "running").length

  return (
    <div
      ref={containerRef}
      data-testid="city-3d-view"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: BACKDROP_FALLBACK,
        isolation: "isolate",
        cursor: hoveredId ? "pointer" : "grab",
      }}
    >
      <div
        role="img"
        aria-label={`Agentic City in 3D with ${agents.length} agents. Drag to orbit, pinch or scroll to zoom. Switch to the 2D map for keyboard agent selection.`}
        style={{ position: "absolute", inset: 0, zIndex: 1 }}
      >
        <Canvas
          dpr={dpr}
          frameloop={reduceMotion ? "demand" : "always"}
          camera={{ fov: CAMERA_FOV, near: 0.5, far: 600, position: [0, 40, 60] }}
          gl={{ alpha: false, antialias: shouldAntialias(deviceDpr), powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.toneMappingExposure = EXPOSURE
            setSceneReady(true)
          }}
          onPointerMissed={() => onSelectAgent(null)}
        >
          {/* Slow GPU: drop the pixel ratio a step at a time (skipped when rendering on demand). */}
          {!reduceMotion && (
            <PerformanceMonitor
              flipflops={4}
              onDecline={() => setDpr((current) => stepDpr(current, -1))}
              onIncline={() => setDpr((current) => stepDpr(current, 1, getInitialDpr(deviceDpr)))}
            />
          )}
          {/* Bright dusk over the neon city: a sky and ground fill, a warm key light and a cool rim from behind. */}
          <color attach="background" args={[FOG_COLOR]} />
          <hemisphereLight args={[LIGHTS.hemisphereSky, LIGHTS.hemisphereGround, LIGHTS.hemisphereIntensity]} />
          <ambientLight intensity={LIGHTS.ambientIntensity} />
          <directionalLight position={[...LIGHTS.keyPosition]} intensity={LIGHTS.keyIntensity} color={LIGHTS.key} />
          <directionalLight position={[...LIGHTS.rimPosition]} intensity={LIGHTS.rimIntensity} color={LIGHTS.rim} />

          <SkyDome />
          <CityGround islands={islands} reduceMotion={reduceMotion} />
          <SkylineRing islands={islands} reduceMotion={reduceMotion} />
          <CityBlocks blocks={blocks} props={props} reduceMotion={reduceMotion} />

          {sceneReady && islands.map((island) => {
            const standing = districtStandings.find((s) => s.districtId === island.id)
            return <DistrictLabel key={island.id} island={island} rank={standing?.rank} score={standing?.formattedScore} />
          })}

          <RobotLayer
            agents={agents}
            islands={islands}
            frame={frame}
            selectedAgentId={selectedAgentId}
            hoveredId={hoveredId}
            reduceMotion={reduceMotion}
            colorBlindMode={colorBlindMode}
            compactLabels={narrow}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
            onSelect={handleSelect}
          />

          <CameraRig frame={frame} fitPoints={fitPoints} insets={insets} reduceMotion={reduceMotion} apiRef={cameraApi} />
        </Canvas>
      </div>

      {/* On a narrow map the status card would push the controls down over the islands, so only the controls show. */}
      {!narrow && (
        <div
          role="status"
          aria-label="City map status"
          data-map-overlay="top"
          style={{ position: "absolute", top: 60, right: 14, zIndex: 3, display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 10, background: "rgba(2,6,23,0.9)", boxShadow: "0 8px 24px rgba(0,0,0,0.28)", backdropFilter: "blur(10px)", pointerEvents: "none" }}
        >
          <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 7, background: "rgba(34,211,238,0.12)", color: "#67e8f9", fontSize: 13 }}>✦</span>
          <span style={{ display: "grid", gap: 2 }}>
            <strong style={{ color: "#f8fafc", fontFamily: "monospace", fontSize: 10, letterSpacing: 1.1 }}>AGENTIC CITY 3D</strong>
            <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 9 }}>{agents.length} robots · {activeCount} en actividad</span>
          </span>
        </div>
      )}
      <div
        role="group"
        aria-label="City map controls"
        data-map-overlay="top"
        style={{ position: "absolute", top: narrow ? 60 : 112, right: 14, zIndex: 5, display: "flex", gap: 5, padding: 5, border: "1px solid rgba(148,163,184,0.22)", borderRadius: 10, background: "rgba(2,6,23,0.9)", backdropFilter: "blur(10px)", cursor: "default" }}
      >
        {[
          { label: "Zoom out", icon: Minus, action: () => cameraApi.current?.zoom(ZOOM_STEP) },
          { label: "Zoom in", icon: Plus, action: () => cameraApi.current?.zoom(1 / ZOOM_STEP) },
          { label: "Center map", icon: LocateFixed, action: () => cameraApi.current?.recenter() },
        ].map(({ label, icon: Icon, action }) => (
          <button key={label} type="button" aria-label={label} title={label} onClick={action} style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: "1px solid transparent", borderRadius: 7, background: "transparent", color: "#cbd5e1", cursor: "pointer" }}>
            <Icon size={16} aria-hidden="true" />
          </button>
        ))}
        {viewToggle}
      </div>
    </div>
  )
}

/** Pixel font glyph width plus letter spacing of the district plates (8px font). */
const LABEL_CHAR_WIDTH = 8.5
const LABEL_SIDE_PADDING = 16
/** Plate offset under its anchor, name row, and the optional rank row. */
const LABEL_NAME_HEIGHT = 6 + 23
const LABEL_RANK_HEIGHT = 18

/** Screen room a district plate needs around its anchor, for the default camera fit. */
function getLabelPad(name: string, withRank: boolean): { padX: number; padBottom: number } {
  return {
    padX: (name.length * LABEL_CHAR_WIDTH + LABEL_SIDE_PADDING) / 2,
    padBottom: LABEL_NAME_HEIGHT + (withRank ? LABEL_RANK_HEIGHT : 0),
  }
}

interface DistrictLabelProps {
  island: IslandLayout
  /** District challenge rank and score, when a challenge is running. */
  rank?: number
  score?: string
}

/**
 * District name plate hanging under the front edge of its island: it never
 * covers the plaza robots or a neighbouring district's skyline top.
 */
const DistrictLabel = memo(function DistrictLabel({ island, rank, score }: DistrictLabelProps) {
  return (
    <Html position={[island.center.x, 0, island.bounds.maxZ + 0.15]} zIndexRange={[2, 1]} pointerEvents="none">
      <div
        data-district-label={island.id}
        style={{
          transform: "translate(-50%, 6px)",
          display: "grid",
          justifyItems: "center",
          gap: 3,
          whiteSpace: "nowrap",
          padding: "5px 7px 4px",
          border: `1px solid ${island.color}66`,
          borderRadius: 6,
          background: "rgba(2,6,23,0.78)",
          color: island.color,
          fontFamily: "var(--font-pixel), monospace",
          fontSize: 8,
          letterSpacing: 0.5,
          textShadow: `0 0 8px ${island.color}88`,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {island.name.toUpperCase()}
        {rank !== undefined && (
          <span style={{ fontFamily: "var(--font-vt323), monospace", fontSize: 13, letterSpacing: 0, color: "#cbd5e1", textShadow: "none" }}>
            #{rank} · {score}
          </span>
        )}
      </div>
    </Html>
  )
})
