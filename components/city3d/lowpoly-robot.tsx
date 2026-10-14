"use client"

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type Group,
} from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { MoltbotAgent } from "@/lib/types"
import { PLAZA_HEIGHT, type IslandLayout, type WorldPoint } from "@/lib/city3d/layout"
import { WALK_SPEED, buildWalkPath, hashString, lerpAngle, samplePath } from "@/lib/city3d/paths"
import {
  ALERT_COLOR,
  ALERT_FLASH_INTENSITY,
  OFFLINE_BODY_TINT,
  ROBOT_RINGS,
  ROBOT_SURFACE,
  ROBOT_WORLD_HEIGHT,
  WALK_LEAN,
  getRobotModelUrl,
  headingToward,
  idleSway,
  walkWaddle,
} from "@/lib/city3d/robot-models"
import {
  STATUS_SYMBOLS,
  bobOffset,
  errorPulse,
  getRobotMotion,
  getStatusColor,
  resolveRobotAccent,
  sameRobotLook,
} from "@/lib/city3d/robot-state"
import { loadRobotModel, type RobotModel } from "./robot-models"

interface SharedRobotResources {
  hit: BoxGeometry
  /** Dark contact shadow and accent ring in one mesh: vertex colors carry the shadow, the material color the accent. */
  footprint: BufferGeometry
  focusRing: RingGeometry
  alertRingMaterial: MeshBasicMaterial
  ringSelected: MeshBasicMaterial
  ringHover: MeshBasicMaterial
  placeholderBody: CapsuleGeometry
  placeholderHead: BoxGeometry
  placeholderVisor: BoxGeometry
  /** Accent ring and placeholder materials, one per color and look. */
  byColor: Map<string, MeshBasicMaterial | MeshStandardMaterial>
}

let shared: SharedRobotResources | null = null

/** Generous invisible hit box (world units): easier to hover and tap than the robot outline. */
const HIT_SIZE = { width: 1.5, height: 2.6 }
/** Space between the head and the name label (world units). */
const LABEL_GAP = 0.3
/** Rings sit a hair above the plaza so they never z-fight with it. */
const RING_Y = PLAZA_HEIGHT + 0.012

function getSharedResources(): SharedRobotResources {
  shared ??= {
    hit: new BoxGeometry(HIT_SIZE.width, HIT_SIZE.height, HIT_SIZE.width),
    footprint: createFootprintGeometry(),
    focusRing: new RingGeometry(ROBOT_RINGS.focus.inner, ROBOT_RINGS.focus.outer, 24),
    alertRingMaterial: new MeshBasicMaterial({ color: ALERT_COLOR, vertexColors: true, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false }),
    ringSelected: new MeshBasicMaterial({ color: "#fbbf24", toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }),
    ringHover: new MeshBasicMaterial({ color: "#e2e8f0", toneMapped: false, transparent: true, opacity: 0.8, depthWrite: false }),
    // Placeholder robot (unit height, faceted): shown while the model loads or if it fails.
    placeholderBody: new CapsuleGeometry(0.22, 0.38, 2, 6).translate(0, 0.41, 0),
    placeholderHead: new BoxGeometry(0.4, 0.28, 0.34).translate(0, 0.86, 0),
    placeholderVisor: new BoxGeometry(0.3, 0.09, 0.02).translate(0, 0.88, 0.175),
    byColor: new Map(),
  }
  return shared
}

/** Shadow disc (dark, half transparent) under an accent ring (white, so the material color shows). */
function createFootprintGeometry(): BufferGeometry {
  const paint = (geometry: BufferGeometry, rgba: readonly [number, number, number, number]): BufferGeometry => {
    const flat = geometry.toNonIndexed()
    geometry.dispose()
    const count = flat.getAttribute("position").count
    const colors = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) colors.set(rgba, i * 4)
    flat.setAttribute("color", new Float32BufferAttribute(colors, 4))
    flat.deleteAttribute("uv")
    return flat
  }
  const shadow = paint(new CircleGeometry(ROBOT_RINGS.shadow, 14).translate(0, 0, -0.004), [0.008, 0.024, 0.09, 0.5])
  const ring = paint(new RingGeometry(ROBOT_RINGS.accent.inner, ROBOT_RINGS.accent.outer, 18), [1, 1, 1, 1])
  const merged = mergeGeometries([shadow, ring], false) ?? ring
  if (merged !== ring) ring.dispose()
  shadow.dispose()
  return merged
}

function accentRingMaterial(resources: SharedRobotResources, color: string, dim: boolean): MeshBasicMaterial {
  const key = `ring|${color}|${dim}`
  let material = resources.byColor.get(key)
  if (!(material instanceof MeshBasicMaterial)) {
    material = new MeshBasicMaterial({ color, vertexColors: true, toneMapped: false, transparent: true, opacity: dim ? 0.45 : 0.95, depthWrite: false })
    resources.byColor.set(key, material)
  }
  return material
}

function placeholderMaterial(resources: SharedRobotResources, color: string, part: "body" | "visor", dim: boolean): MeshStandardMaterial {
  const key = `placeholder|${part}|${color}|${dim}`
  let material = resources.byColor.get(key)
  if (!(material instanceof MeshStandardMaterial)) {
    material = new MeshStandardMaterial({ flatShading: true, roughness: ROBOT_SURFACE.roughness, metalness: ROBOT_SURFACE.metalness })
    if (part === "body") {
      material.color.set(dim ? OFFLINE_BODY_TINT : "#cbd5e1").lerp(new Color(color), dim ? 0 : 0.35)
    } else {
      material.color.set(dim ? "#334155" : color)
      if (!dim) {
        material.emissive.set(color)
        material.emissiveIntensity = 0.7
      }
    }
    resources.byColor.set(key, material)
  }
  return material
}

/** Frees the shared robot resources (when the 3D view unmounts). */
export function disposeRobotResources(): void {
  if (!shared) return
  for (const [key, resource] of Object.entries(shared)) {
    if (key !== "byColor") (resource as { dispose(): void }).dispose()
  }
  for (const material of shared.byColor.values()) material.dispose()
  shared = null
}

/** The district's robot model once loaded; null while loading, after a failure or for an unknown district. */
function useRobotModel(url: string | null): RobotModel | null {
  const [loaded, setLoaded] = useState<RobotModel | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    loadRobotModel(url).then(
      (model) => {
        if (alive) setLoaded(model)
      },
      (error: unknown) => {
        if (alive) console.warn("[city-3d] robot model failed, keeping the placeholder", error)
      },
    )
    return () => {
      alive = false
    }
  }, [url])
  return loaded && loaded.url === url ? loaded : null
}

export interface LowPolyRobotProps {
  agent: MoltbotAgent
  island: IslandLayout
  /** Where the 2D map had the agent, in world space. Becomes the first waypoint. */
  start: WorldPoint
  selected: boolean
  hovered: boolean
  labelLift: number
  reduceMotion: boolean
  colorBlindMode: boolean
  onHoverStart: (id: string) => void
  onHoverEnd: (id: string) => void
  onSelect: (id: string) => void
}

/** Skips re-renders when the hub refreshes agents with nothing this robot shows changed. */
function robotPropsEqual(prev: LowPolyRobotProps, next: LowPolyRobotProps): boolean {
  return (
    prev.island === next.island &&
    prev.start === next.start &&
    prev.selected === next.selected &&
    prev.hovered === next.hovered &&
    prev.labelLift === next.labelLift &&
    prev.reduceMotion === next.reduceMotion &&
    prev.colorBlindMode === next.colorBlindMode &&
    prev.onHoverStart === next.onHoverStart &&
    prev.onHoverEnd === next.onHoverEnd &&
    prev.onSelect === next.onSelect &&
    sameRobotLook(prev.agent, next.agent, next.hovered || next.selected)
  )
}

/**
 * An agent as its district's low-poly robot (unrigged): working robots walk
 * their plaza loop with a bob and turn smoothly, idle ones sway, offline ones
 * are grayed, errors flash red. The agent's own color is the glowing ring at
 * its feet.
 */
export const LowPolyRobot = memo(LowPolyRobotView, robotPropsEqual)

function LowPolyRobotView({
  agent,
  island,
  start,
  selected,
  hovered,
  labelLift,
  reduceMotion,
  colorBlindMode,
  onHoverStart,
  onHoverEnd,
  onSelect,
}: LowPolyRobotProps) {
  const groupRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)
  const labelRef = useRef<Group>(null)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const resources = getSharedResources()
  const model = useRobotModel(getRobotModelUrl(agent.district))
  const motion = getRobotMotion(agent.status, reduceMotion)
  const emphasized = hovered || selected
  const accent = resolveRobotAccent(agent.color, island.color)
  const phase = useMemo(() => (hashString(agent.id) % 628) / 100, [agent.id])
  const path = useMemo(() => buildWalkPath(agent.id, island.walkArea, start), [agent.id, island.walkArea, start])
  const walkState = useRef({ distance: 0, heading: 0 })
  const labelHeight = PLAZA_HEIGHT + ROBOT_WORLD_HEIGHT + LABEL_GAP + labelLift

  // Error: this robot's own copy of its body material, so only it flashes red.
  const bodyBase = model ? model.lit : placeholderMaterial(resources, island.color, "body", false)
  const alertBody = useMemo(() => {
    if (!motion.alert) return null
    const material = bodyBase.clone()
    material.emissive.set(ALERT_COLOR)
    material.emissiveIntensity = ALERT_FLASH_INTENSITY
    return material
  }, [motion.alert, bodyBase])
  useEffect(() => () => alertBody?.dispose(), [alertBody])

  // Place the robot at the start of its loop: walkers face the next waypoint,
  // the others turn roughly toward the viewer.
  useLayoutEffect(() => {
    const first = samplePath(path, 0)
    const jitter = ((hashString(`${agent.id}:face`) % 100) / 100 - 0.5) * 0.9
    walkState.current = {
      distance: 0,
      heading: motion.walk ? first.heading : headingToward(first, { x: camera.position.x, z: camera.position.z }, jitter),
    }
    groupRef.current?.position.set(first.x, 0, first.z)
    invalidate()
    // Only on a new path: a status change keeps the robot where it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, camera, invalidate])

  useFrame((state, delta) => {
    const group = groupRef.current
    const body = bodyRef.current
    if (!group || !body) return
    const dt = Math.min(delta, 0.1)
    const t = state.clock.elapsedTime
    const walk = walkState.current
    if (motion.walk) {
      walk.distance += WALK_SPEED * dt
      const sample = samplePath(path, walk.distance)
      group.position.x = sample.x
      group.position.z = sample.z
      walk.heading = lerpAngle(walk.heading, sample.heading, dt * 6)
    }
    const bob = motion.bob ? bobOffset(t, motion.walk, phase) : 0
    body.position.y = PLAZA_HEIGHT + bob
    if (motion.walk) {
      body.rotation.set(WALK_LEAN, walk.heading, walkWaddle(t, phase))
    } else if (motion.bob) {
      const sway = idleSway(t, phase)
      body.rotation.set(0, walk.heading + sway.yaw, sway.roll)
    } else {
      body.rotation.set(0, walk.heading, 0)
    }

    // The label rides the camera's up vector so it stays over the head at any tilt.
    const label = labelRef.current
    if (label) {
      const m = state.camera.matrixWorld.elements
      const lift = labelHeight + bob
      label.position.set(m[4] * lift, m[5] * lift, m[6] * lift)
    }

    if (motion.alert) {
      const k = motion.pulse ? errorPulse(t) : 1
      if (alertBody) alertBody.emissiveIntensity = ALERT_FLASH_INTENSITY * (0.25 + 0.75 * k)
      resources.alertRingMaterial.opacity = 0.45 + 0.5 * k
    }
  })

  // Status and model changes need a frame even when rendering on demand.
  useLayoutEffect(() => {
    invalidate()
  }, [model, motion.alert, motion.dim, motion.walk, emphasized, invalidate])

  const ringMaterial = motion.alert ? resources.alertRingMaterial : accentRingMaterial(resources, accent, motion.dim)

  return (
    <group ref={groupRef}>
      <group ref={bodyRef} position-y={PLAZA_HEIGHT} scale={ROBOT_WORLD_HEIGHT} rotation-order="YXZ">
        {model ? (
          <mesh geometry={model.geometry} material={motion.dim ? model.dim : (alertBody ?? model.lit)} />
        ) : (
            <>
              <mesh geometry={resources.placeholderBody} material={alertBody ?? placeholderMaterial(resources, island.color, "body", motion.dim)} />
              <mesh geometry={resources.placeholderHead} material={alertBody ?? placeholderMaterial(resources, island.color, "body", motion.dim)} />
              <mesh geometry={resources.placeholderVisor} material={placeholderMaterial(resources, island.color, "visor", motion.dim)} />
            </>
          )}
      </group>
      <mesh geometry={resources.footprint} material={ringMaterial} rotation-x={-Math.PI / 2} position-y={RING_Y} />
      {emphasized && (
        <mesh
          geometry={resources.focusRing}
          material={selected ? resources.ringSelected : resources.ringHover}
          rotation-x={-Math.PI / 2}
          position-y={RING_Y + 0.004}
        />
      )}
      <mesh
        geometry={resources.hit}
        position-y={HIT_SIZE.height / 2}
        visible={false}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          onHoverStart(agent.id)
        }}
        onPointerOut={() => onHoverEnd(agent.id)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          onSelect(agent.id)
        }}
      />
      <group ref={labelRef} position-y={labelHeight}>
        {/* drei only refreshes zIndex when the label moves, so remount it when emphasis changes. */}
        <Html key={emphasized ? "front" : "base"} zIndexRange={emphasized ? [6, 5] : [4, 3]} pointerEvents="none">
          <AgentLabel agent={agent} emphasized={emphasized} selected={selected} colorBlindMode={colorBlindMode} />
        </Html>
      </group>
    </group>
  )
}

interface AgentLabelProps {
  agent: MoltbotAgent
  emphasized: boolean
  selected: boolean
  colorBlindMode: boolean
}

const labelBase: CSSProperties = {
  transform: "translate(-50%, -100%)",
  whiteSpace: "nowrap",
  padding: "0 6px 1px",
  borderRadius: 4,
  background: "rgba(2,6,23,0.82)",
  fontFamily: "var(--font-vt323), monospace",
  lineHeight: 1.05,
  pointerEvents: "none",
  userSelect: "none",
}

function AgentLabel({ agent, emphasized, selected, colorBlindMode }: AgentLabelProps) {
  const statusColor = getStatusColor(agent.status)
  return (
    <div
      data-agent-label={agent.name}
      data-emphasized={emphasized}
      data-selected={selected}
      style={{
        ...labelBase,
        border: `1px solid ${selected ? "#fbbf24" : emphasized ? "#475569" : "#1e293b"}`,
        boxShadow: emphasized ? "0 4px 16px rgba(0,0,0,0.55)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 15, color: agent.color }}>
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, flex: "none" }}
        />
        {colorBlindMode && <span style={{ color: statusColor }}>{STATUS_SYMBOLS[agent.status] ?? "*"}</span>}
        {agent.name}
      </div>
      {emphasized && (
        <div style={{ fontSize: 13, color: "#94a3b8", paddingBottom: 1 }}>
          <span style={{ color: statusColor }}>{agent.status.toUpperCase()}</span> · CPU {Math.round(agent.cpu)}%
          {agent.currentTask && (
            <div style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", color: "#cbd5e1" }}>
              {agent.currentTask}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
