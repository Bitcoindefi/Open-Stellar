"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Canvas } from "@react-three/fiber"
import { Html, PerformanceMonitor, Stars } from "@react-three/drei"
import { LocateFixed, Minus, Plus } from "lucide-react"
import type { PixelCityProps } from "@/components/pixel-city"
import { buildCityBlocks } from "@/lib/city3d/buildings"
import {
  CAMERA_FOV,
  ISLAND_HEIGHT,
  buildIslandLayouts,
  findIsland,
  getCityFrame,
  mapToWorld,
  type IslandLayout,
  type WorldPoint,
} from "@/lib/city3d/layout"
import { getInitialDpr, shouldAntialias, stepDpr } from "@/lib/city3d/quality"
import { computeDistrictFocus, getLabelLifts } from "@/lib/city3d/robot-state"
import { disposeRobotGeometries } from "@/lib/city3d/voxel-geometry"
import { CameraRig, type CameraApi } from "./camera-rig"
import { CityBlocks } from "./city-blocks"
import { VoxelRobot } from "./voxel-robot"

export interface City3DViewProps extends PixelCityProps {
  /** The 2D / 3D switch, rendered at the end of the control bar. */
  viewToggle?: ReactNode
}

const SKY = "#020617"
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
  // Client-only module (next/dynamic, ssr: false), so window is available here.
  const [deviceDpr] = useState(() => window.devicePixelRatio || 1)
  const [dpr, setDpr] = useState(() => getInitialDpr(deviceDpr))
  const cameraApi = useRef<CameraApi | null>(null)
  const frame = useMemo(() => getCityFrame(districts), [districts])
  const islands = useMemo(() => buildIslandLayouts(districts, frame), [districts, frame])
  const blocks = useMemo(() => buildCityBlocks(islands), [islands])
  const lifts = getLabelLifts(agents)

  // Each robot starts where the 2D map first saw it; kept stable so loops do not reset on updates.
  const startsRef = useRef(new Map<string, WorldPoint>())
  const startFor = (id: string, px: number, py: number): WorldPoint => {
    let start = startsRef.current.get(id)
    if (!start) {
      start = mapToWorld(px, py, frame)
      startsRef.current.set(id, start)
    }
    return start
  }

  useEffect(() => () => disposeRobotGeometries(), [])

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
      data-testid="city-3d-view"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: SKY,
        isolation: "isolate",
        cursor: hoveredId ? "pointer" : "grab",
      }}
    >
      <div
        role="img"
        aria-label={`Agentic City in 3D with ${agents.length} agents. Drag to orbit, pinch or scroll to zoom. Switch to the 2D map for keyboard agent selection.`}
        style={{ position: "absolute", inset: 0 }}
      >
        <Canvas
          dpr={dpr}
          frameloop={reduceMotion ? "demand" : "always"}
          camera={{ fov: CAMERA_FOV, near: 0.5, far: 600, position: [0, 40, 60] }}
          gl={{ antialias: shouldAntialias(deviceDpr), powerPreference: "high-performance" }}
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
          <color attach="background" args={[SKY]} />
          <hemisphereLight args={["#1e3a8a", SKY, 0.9]} />
          <ambientLight intensity={0.25} />
          <directionalLight position={[-18, 36, 22]} intensity={1.3} color="#c7d2fe" />
          <Stars radius={150} depth={50} count={1400} factor={4} saturation={0} fade speed={reduceMotion ? 0 : 0.4} />

          {/* Unlit ground and a plain line grid: the cheapest full-screen layers there are. */}
          <mesh rotation-x={-Math.PI / 2} position-y={-ISLAND_HEIGHT - 0.02}>
            <planeGeometry args={[400, 400]} />
            <meshBasicMaterial color="#030a1c" />
          </mesh>
          <gridHelper args={[240, 120, "#334155", "#172033"]} position-y={-ISLAND_HEIGHT} />

          <CityBlocks blocks={blocks} reduceMotion={reduceMotion} />

          {islands.map((island) => {
            const standing = districtStandings.find((s) => s.districtId === island.id)
            return <DistrictLabel key={island.id} island={island} rank={standing?.rank} score={standing?.formattedScore} />
          })}

          {agents.map((agent) => {
            const island = findIsland(islands, agent.district)
            if (!island) return null
            return (
              <VoxelRobot
                key={agent.id}
                agent={agent}
                island={island}
                start={startFor(agent.id, agent.pixelX, agent.pixelY)}
                selected={agent.id === selectedAgentId}
                hovered={agent.id === hoveredId}
                labelLift={lifts.get(agent.id) ?? 0}
                reduceMotion={reduceMotion}
                colorBlindMode={colorBlindMode}
                onHoverStart={handleHoverStart}
                onHoverEnd={handleHoverEnd}
                onSelect={handleSelect}
              />
            )
          })}

          <CameraRig frame={frame} reduceMotion={reduceMotion} apiRef={cameraApi} />
        </Canvas>
      </div>

      <div
        role="status"
        aria-label="City map status"
        style={{ position: "absolute", top: 60, right: 14, zIndex: 3, display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 10, background: "rgba(2,6,23,0.9)", boxShadow: "0 8px 24px rgba(0,0,0,0.28)", backdropFilter: "blur(10px)", pointerEvents: "none" }}
      >
        <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 7, background: "rgba(34,211,238,0.12)", color: "#67e8f9", fontSize: 13 }}>✦</span>
        <span style={{ display: "grid", gap: 2 }}>
          <strong style={{ color: "#f8fafc", fontFamily: "monospace", fontSize: 10, letterSpacing: 1.1 }}>AGENTIC CITY 3D</strong>
          <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 9 }}>{agents.length} robots · {activeCount} en actividad</span>
        </span>
      </div>
      <div
        role="group"
        aria-label="City map controls"
        style={{ position: "absolute", top: 112, right: 14, zIndex: 5, display: "flex", gap: 5, padding: 5, border: "1px solid rgba(148,163,184,0.22)", borderRadius: 10, background: "rgba(2,6,23,0.9)", backdropFilter: "blur(10px)", cursor: "default" }}
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
