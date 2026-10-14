"use client"

import { memo, useEffect, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import type { MoltbotAgent } from "@/lib/types"
import { findIsland, mapToWorld, type CityFrame, type IslandLayout, type WorldPoint } from "@/lib/city3d/layout"
import { getLabelLifts } from "@/lib/city3d/robot-state"
import { LowPolyRobot, disposeRobotResources } from "./lowpoly-robot"
import { RobotAnimatorSet } from "./robot-animator"
import { disposeRobotModels } from "./robot-models"

/**
 * Mount point for the robots in the 3D city. The environment (sky, terrain,
 * islands, buildings, props) knows nothing about agents; everything robot
 * related lives behind this one component, so the robot renderer can be swapped
 * without touching the scene.
 *
 * Contract for a robot renderer (today LowPolyRobot, the district's low-poly
 * GLB model, rigged with Walk and Idle clips, with a faceted placeholder while
 * it loads):
 * - one robot per agent, on `findIsland(islands, agent.district)`;
 * - its walk loop stays inside `island.walkArea`, standing on y = PLAZA_HEIGHT;
 * - the first waypoint is `start` (where the 2D map had the agent);
 * - hover and click go through onHoverStart / onHoverEnd / onSelect;
 * - the name label rises `labelLift` extra world units so stacked labels do not overlap;
 * - skinned clips register their mixer in `animators`, advanced once per frame here;
 * - no motion under `reduceMotion` (the canvas renders on demand then).
 */
export interface RobotLayerProps {
  agents: readonly MoltbotAgent[]
  islands: readonly IslandLayout[]
  frame: CityFrame
  selectedAgentId: string | null
  hoveredId: string | null
  reduceMotion: boolean
  colorBlindMode: boolean
  onHoverStart: (id: string) => void
  onHoverEnd: (id: string) => void
  onSelect: (id: string) => void
}

export const RobotLayer = memo(function RobotLayer({
  agents,
  islands,
  frame,
  selectedAgentId,
  hoveredId,
  reduceMotion,
  colorBlindMode,
  onHoverStart,
  onHoverEnd,
  onSelect,
}: RobotLayerProps) {
  const lifts = getLabelLifts(agents)

  // Every skinned robot's mixer, advanced here in one frame callback. Under
  // reduced motion the robots hold a static pose and nothing runs.
  const [animators] = useState(() => new RobotAnimatorSet())
  useFrame((_, delta) => {
    animators.update(Math.min(delta, 0.1))
  })

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

  useEffect(
    () => () => {
      disposeRobotResources()
      disposeRobotModels()
    },
    [],
  )

  return (
    <group name="robots">
      {agents.map((agent) => {
        const island = findIsland(islands, agent.district)
        if (!island) return null
        return (
          <LowPolyRobot
            key={agent.id}
            agent={agent}
            island={island}
            start={startFor(agent.id, agent.pixelX, agent.pixelY)}
            selected={agent.id === selectedAgentId}
            hovered={agent.id === hoveredId}
            labelLift={lifts.get(agent.id) ?? 0}
            reduceMotion={reduceMotion}
            colorBlindMode={colorBlindMode}
            animators={animators}
            onHoverStart={onHoverStart}
            onHoverEnd={onHoverEnd}
            onSelect={onSelect}
          />
        )
      })}
    </group>
  )
})
