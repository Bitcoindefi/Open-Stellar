"use client"

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  MeshBasicMaterial,
  RingGeometry,
  type Group,
  type Mesh,
  type Sprite,
  type SpriteMaterial,
  type Texture,
} from "three"
import type { MoltbotAgent } from "@/lib/types"
import { getDistrictRobot, getRobotFrameIndex, robotPhaseFor } from "@/lib/robot-sprites"
import { PLAZA_HEIGHT, type IslandLayout, type WorldPoint } from "@/lib/city3d/layout"
import { WALK_SPEED, buildWalkPath, hashString, lerpAngle, samplePath } from "@/lib/city3d/paths"
import {
  OFFLINE_SPRITE_OPACITY,
  SPRITE_ALPHA_TEST,
  getFrameWindow,
  getSpriteFilter,
  getSpriteWorldSize,
  isFacingLeft,
} from "@/lib/city3d/sprites"
import {
  STATUS_SYMBOLS,
  bobOffset,
  errorPulse,
  getRobotMotion,
  getStatusColor,
  sameRobotLook,
} from "@/lib/city3d/robot-state"
import { getRobotSheetTexture } from "./textures"

interface SharedRobotResources {
  hit: BoxGeometry
  shadow: CircleGeometry
  shadowMaterial: MeshBasicMaterial
  alertMaterial: MeshBasicMaterial
  ring: RingGeometry
  ringSelected: MeshBasicMaterial
  ringHover: MeshBasicMaterial
}

let shared: SharedRobotResources | null = null

/** Generous invisible hit box (world units): easier to hover and tap than the sprite outline. */
const HIT_SIZE = { width: 1.6, height: 3.2 }
/** Space between the head and the name label (world units). */
const LABEL_GAP = 0.3

/** Geometry and materials every robot reuses (hit box, blob shadow, alert glow, selection ring). */
function getSharedResources(): SharedRobotResources {
  shared ??= {
    hit: new BoxGeometry(HIT_SIZE.width, HIT_SIZE.height, HIT_SIZE.width),
    shadow: new CircleGeometry(0.7, 20),
    shadowMaterial: new MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.4, depthWrite: false }),
    alertMaterial: new MeshBasicMaterial({ color: "#ef4444", toneMapped: false, transparent: true, opacity: 0.6, depthWrite: false }),
    ring: new RingGeometry(0.9, 1.07, 36),
    ringSelected: new MeshBasicMaterial({ color: "#fbbf24", toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }),
    ringHover: new MeshBasicMaterial({ color: "#e2e8f0", toneMapped: false, transparent: true, opacity: 0.8, depthWrite: false }),
  }
  return shared
}

/** Frees the shared robot resources (when the 3D view unmounts). */
export function disposeRobotResources(): void {
  if (!shared) return
  for (const resource of Object.values(shared)) resource.dispose()
  shared = null
}

const WHITE = new Color("#ffffff")
const ALERT_TINT = new Color("#ff5a5a")

/**
 * This robot's copy of its district strip with the agent look baked in. The
 * clone shares the GPU upload and carries its own frame window.
 */
function useSpriteTexture(sheet: string, filter: string | null, frames: number): Texture | null {
  const [base, setBase] = useState<Texture | null>(null)
  useEffect(() => {
    let alive = true
    getRobotSheetTexture(sheet, filter).then(
      (texture) => {
        if (alive) setBase(texture)
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [sheet, filter])
  const texture = useMemo(() => {
    if (!base) return null
    const clone = base.clone()
    const cell = getFrameWindow(0, frames)
    clone.repeat.set(cell.repeatX, 1)
    clone.offset.set(cell.offsetX, 0)
    return clone
  }, [base, frames])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

export interface SpriteRobotProps {
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
function robotPropsEqual(prev: SpriteRobotProps, next: SpriteRobotProps): boolean {
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
 * An agent as its 2D pixel robot, drawn as a camera-facing billboard: same art,
 * same walk cycle, same agent color and status looks as the 2D map.
 */
export const SpriteRobot = memo(SpriteRobotView, robotPropsEqual)

function SpriteRobotView({
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
}: SpriteRobotProps) {
  const groupRef = useRef<Group>(null)
  const spriteRef = useRef<Sprite>(null)
  const materialRef = useRef<SpriteMaterial>(null)
  const labelRef = useRef<Group>(null)
  const shadowRef = useRef<Mesh>(null)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const set = getDistrictRobot(agent.district)
  const size = getSpriteWorldSize(set)
  const resources = getSharedResources()
  const motion = getRobotMotion(agent.status, reduceMotion)
  const emphasized = hovered || selected
  const filter = getSpriteFilter(set, {
    dim: motion.dim,
    color: agent.color,
    skin: agent.appearance?.skin,
    outlineColor: island.color,
  })
  const texture = useSpriteTexture(set.sheet, filter, set.frames)
  const framePhase = useMemo(() => robotPhaseFor(agent.id), [agent.id])
  const bobPhase = useMemo(() => (hashString(agent.id) % 628) / 100, [agent.id])
  const path = useMemo(() => buildWalkPath(agent.id, island.walkArea, start), [agent.id, island.walkArea, start])
  const walkState = useRef({ distance: 0, heading: 0, facingLeft: false, frame: -1, mirrored: false })
  const labelHeight = size.height + LABEL_GAP + labelLift

  // Place the robot at the start of its loop, facing the next waypoint.
  useLayoutEffect(() => {
    const first = samplePath(path, 0)
    const right = camera.matrixWorld.elements
    walkState.current = {
      distance: 0,
      heading: first.heading,
      facingLeft: isFacingLeft(Math.sin(first.heading), Math.cos(first.heading), right[0], right[2], false),
      frame: -1,
      mirrored: false,
    }
    groupRef.current?.position.set(first.x, 0, first.z)
    invalidate()
  }, [path, camera, invalidate])

  // A new strip variant (status or color change) needs its frame window again.
  useLayoutEffect(() => {
    walkState.current.frame = -1
    invalidate()
  }, [texture, invalidate])

  useFrame((state, delta) => {
    const group = groupRef.current
    const sprite = spriteRef.current
    if (!group || !sprite) return
    const dt = Math.min(delta, 0.1)
    const t = state.clock.elapsedTime
    const walk = walkState.current
    if (motion.walk) {
      walk.distance += WALK_SPEED * dt
      const sample = samplePath(path, walk.distance)
      group.position.x = sample.x
      group.position.z = sample.z
      walk.heading = lerpAngle(walk.heading, sample.heading, dt * 8)
    }
    // Camera basis: column 0 is screen right, column 1 is screen up.
    const m = state.camera.matrixWorld.elements
    walk.facingLeft = isFacingLeft(Math.sin(walk.heading), Math.cos(walk.heading), m[0], m[2], walk.facingLeft)
    const bob = motion.bob ? bobOffset(t, motion.walk, bobPhase) : 0
    sprite.position.y = PLAZA_HEIGHT + bob

    // Walk cycle: this robot's own clone of the strip, so only its window moves.
    const material = materialRef.current
    const map = material?.map
    if (map) {
      const frame = getRobotFrameIndex(t * 1000, set.frames, set.frameMs, motion.walk, framePhase)
      if (frame !== walk.frame || walk.facingLeft !== walk.mirrored) {
        const cell = getFrameWindow(frame, set.frames, walk.facingLeft)
        map.offset.x = cell.offsetX
        map.repeat.x = cell.repeatX
        walk.frame = frame
        walk.mirrored = walk.facingLeft
      }
    }

    // The label rides the camera's up vector so it stays over the head at any tilt.
    const label = labelRef.current
    if (label) {
      const lift = labelHeight + bob
      label.position.set(m[4] * lift, m[5] * lift, m[6] * lift)
    }

    if (material && motion.alert) {
      const k = motion.pulse ? errorPulse(t) : 1
      material.color.lerpColors(WHITE, ALERT_TINT, 0.7 * k)
      // The shadow is the shared red alert glow while the robot is in error.
      const glow = shadowRef.current?.material
      if (glow instanceof MeshBasicMaterial) glow.opacity = 0.25 + 0.5 * k
    }
  })

  // Clear the alert tint when the robot recovers.
  useLayoutEffect(() => {
    if (!motion.alert) materialRef.current?.color.copy(WHITE)
    invalidate()
  }, [motion.alert, invalidate])

  return (
    <group ref={groupRef}>
      <sprite
        ref={spriteRef}
        center={[0.5, 0]}
        scale={[size.width, size.height, 1]}
        position-y={PLAZA_HEIGHT}
        visible={texture !== null}
      >
        <spriteMaterial
          ref={materialRef}
          map={texture}
          transparent
          alphaTest={SPRITE_ALPHA_TEST}
          opacity={motion.dim ? OFFLINE_SPRITE_OPACITY : 1}
          toneMapped={false}
        />
      </sprite>
      <mesh
        ref={shadowRef}
        geometry={resources.shadow}
        material={motion.alert ? resources.alertMaterial : resources.shadowMaterial}
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
      <group ref={labelRef} position-y={labelHeight}>
        <Html zIndexRange={[4, 3]} pointerEvents="none">
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
