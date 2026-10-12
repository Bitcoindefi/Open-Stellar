"use client"

import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react"
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  type Group,
} from "three"
import type { MoltbotAgent } from "@/lib/types"
import { PLAZA_HEIGHT, type IslandLayout, type WorldPoint } from "@/lib/city3d/layout"
import { WALK_SPEED, buildWalkPath, hashString, lerpAngle, samplePath } from "@/lib/city3d/paths"
import { ROBOT_WORLD_SCALE, getModelHeight, getRobotModel } from "@/lib/city3d/robot-models"
import { getRobotGeometries } from "@/lib/city3d/voxel-geometry"
import { desaturateHex } from "@/lib/city3d/colors"
import {
  STATUS_SYMBOLS,
  bobOffset,
  errorPulse,
  getRobotMotion,
  getStatusColor,
  resolveRobotAccent,
  sameRobotLook,
} from "@/lib/city3d/robot-state"

interface SharedRobotResources {
  hit: BoxGeometry
  shadow: CircleGeometry
  shadowMaterial: MeshBasicMaterial
  ring: RingGeometry
  ringSelected: MeshBasicMaterial
  ringHover: MeshBasicMaterial
}

let shared: SharedRobotResources | null = null

/** Generous invisible hit box (world units): easier to hover and tap than the thin voxel parts. */
const HIT_SIZE = { width: 1.3, height: 2.7 }

/** Geometry and materials every robot reuses (hit box, blob shadow, selection ring). */
function getSharedResources(): SharedRobotResources {
  shared ??= {
    hit: new BoxGeometry(HIT_SIZE.width, HIT_SIZE.height, HIT_SIZE.width),
    shadow: new CircleGeometry(0.62, 20),
    shadowMaterial: new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.45, depthWrite: false }),
    ring: new RingGeometry(0.82, 0.98, 36),
    ringSelected: new MeshBasicMaterial({ color: "#fbbf24", toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }),
    ringHover: new MeshBasicMaterial({ color: "#e2e8f0", toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false }),
  }
  return shared
}

const ALERT_COLOR = new Color("#f87171")
const ALERT_DARK = new Color("#7f1d1d")

export interface VoxelRobotProps {
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
function robotPropsEqual(prev: VoxelRobotProps, next: VoxelRobotProps): boolean {
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

export const VoxelRobot = memo(VoxelRobotView, robotPropsEqual)

function VoxelRobotView({
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
}: VoxelRobotProps) {
  const groupRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const model = getRobotModel(agent.district)
  const geometries = getRobotGeometries(model)
  const resources = getSharedResources()
  const accent = resolveRobotAccent(agent.color, island.color)
  const motion = getRobotMotion(agent.status, reduceMotion)
  const emphasized = hovered || selected
  const phase = useMemo(() => (hashString(agent.id) % 628) / 100, [agent.id])
  const path = useMemo(() => buildWalkPath(agent.id, island.walkArea, start), [agent.id, island.walkArea, start])
  const walkState = useRef({ distance: 0, heading: 0 })
  const bodyMaterial = useRef<MeshLambertMaterial>(null)
  const glowMaterial = useRef<MeshBasicMaterial>(null)

  // Static colors for the current status; the error pulse animates on top in useFrame.
  // The agent color doubles as a faint emissive rim on the shell (the 2D hue shift intent).
  const bodyColor = motion.dim ? "#6b7280" : "#ffffff"
  const bodyEmissive = motion.alert ? "#ef4444" : accent
  const bodyEmissiveIntensity = motion.alert ? 0.4 : emphasized ? 0.28 : motion.dim ? 0 : 0.07
  const accentColor = motion.dim ? desaturateHex(accent, 0.85, 0.55) : accent
  const accentEmissive = motion.dim ? "#000000" : accent
  const glowColor = motion.dim ? desaturateHex(accent, 0.9, 0.35) : motion.alert ? "#f87171" : accent

  // Place the robot at the start of its loop, facing the next waypoint.
  useLayoutEffect(() => {
    const first = samplePath(path, 0)
    walkState.current = { distance: 0, heading: first.heading }
    groupRef.current?.position.set(first.x, 0, first.z)
    if (bodyRef.current) bodyRef.current.rotation.y = first.heading
    invalidate()
  }, [path, invalidate])

  useFrame((state, delta) => {
    const group = groupRef.current
    const body = bodyRef.current
    if (!group || !body) return
    const dt = Math.min(delta, 0.1)
    const t = state.clock.elapsedTime
    if (motion.walk) {
      const walk = walkState.current
      walk.distance += WALK_SPEED * dt
      const sample = samplePath(path, walk.distance)
      group.position.x = sample.x
      group.position.z = sample.z
      walk.heading = lerpAngle(walk.heading, sample.heading, dt * 8)
      body.rotation.y = walk.heading
    }
    body.position.y = PLAZA_HEIGHT + (motion.bob ? bobOffset(t, motion.walk, phase) : 0)
    const shell = bodyMaterial.current
    const glow = glowMaterial.current
    if (motion.pulse && shell && glow) {
      const k = errorPulse(t)
      shell.emissiveIntensity = 0.12 + 0.5 * k
      glow.color.lerpColors(ALERT_DARK, ALERT_COLOR, k)
    }
  })

  const labelY = getModelHeight(model) * ROBOT_WORLD_SCALE + 0.35 + labelLift

  return (
    <group ref={groupRef}>
      <group ref={bodyRef} scale={ROBOT_WORLD_SCALE}>
        <mesh geometry={geometries.body}>
          <meshLambertMaterial
            ref={bodyMaterial}
            vertexColors
            color={bodyColor}
            emissive={bodyEmissive}
            emissiveIntensity={bodyEmissiveIntensity}
          />
        </mesh>
        <mesh geometry={geometries.accent}>
          <meshLambertMaterial color={accentColor} emissive={accentEmissive} emissiveIntensity={0.35} />
        </mesh>
        <mesh geometry={geometries.glow}>
          <meshBasicMaterial ref={glowMaterial} toneMapped={false} color={glowColor} />
        </mesh>
      </group>
      <mesh
        geometry={resources.shadow}
        material={resources.shadowMaterial}
        rotation-x={-Math.PI / 2}
        position-y={PLAZA_HEIGHT + 0.005}
      />
      {emphasized && (
        <mesh
          geometry={resources.ring}
          material={selected ? resources.ringSelected : resources.ringHover}
          rotation-x={-Math.PI / 2}
          position-y={PLAZA_HEIGHT + 0.012}
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
      <Html position={[0, labelY, 0]} zIndexRange={[4, 3]} pointerEvents="none">
        <AgentLabel agent={agent} emphasized={emphasized} selected={selected} colorBlindMode={colorBlindMode} />
      </Html>
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
