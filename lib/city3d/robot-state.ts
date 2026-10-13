import { colorHue, shouldAnimateRobot } from "@/lib/robot-sprites"
import type { AgentStatus } from "@/lib/types"

/**
 * How a 3D robot behaves for an agent status. Mirrors the 2D map: working
 * robots move, offline ones are powered down, errors flash red.
 */
export interface RobotMotion {
  /** Walks its plaza loop. */
  walk: boolean
  /** Gentle hover/breathing bob. */
  bob: boolean
  /** Desaturated and dimmed (offline). */
  dim: boolean
  /** Red alert tint (error). */
  alert: boolean
  /** Alert tint pulses over time (off under reduced motion). */
  pulse: boolean
}

export function getRobotMotion(status: AgentStatus | string, reduceMotion = false): RobotMotion {
  if (status === "offline" || status === "stopped") {
    return { walk: false, bob: false, dim: true, alert: false, pulse: false }
  }
  if (status === "error") {
    return { walk: false, bob: false, dim: false, alert: true, pulse: !reduceMotion }
  }
  return {
    walk: shouldAnimateRobot(status, false, reduceMotion),
    bob: !reduceMotion,
    dim: false,
    alert: false,
    pulse: false,
  }
}

/** Alert pulse in [0, 1] at roughly 1.2 Hz. */
export function errorPulse(timeSec: number): number {
  if (!Number.isFinite(timeSec)) return 1
  return 0.5 + 0.5 * Math.sin(timeSec * Math.PI * 2 * 1.2)
}

/** Vertical bob offset (world units) for a robot at `timeSec`. */
export function bobOffset(timeSec: number, walking: boolean, phase = 0): number {
  if (!Number.isFinite(timeSec)) return 0
  return walking
    ? Math.abs(Math.sin(timeSec * 7 + phase)) * 0.06
    : (Math.sin(timeSec * 2 + phase) + 1) * 0.025
}

/**
 * Accent color for a robot: the agent's own color when it carries a hue (same
 * intent as the 2D hue shift), otherwise the district color.
 */
export function resolveRobotAccent(agentColor: string | null | undefined, districtColor: string): string {
  return colorHue(agentColor) === null ? districtColor : (agentColor as string).trim()
}

/** Status colors shared with the 2D hover tooltip. */
export const STATUS_COLORS: Record<string, string> = {
  active: "#34d399",
  running: "#38bdf8",
  working: "#fbbf24",
  idle: "#94a3b8",
  error: "#f87171",
  offline: "#f87171",
  degraded: "#fb923c",
  stopped: "#64748b",
}

/** Text symbols for color-blind mode, matching the 2D map. */
export const STATUS_SYMBOLS: Record<string, string> = {
  active: "●",
  working: "◆",
  idle: "○",
  error: "✕",
  offline: "-",
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? "#64748b"
}

/** Agent fields a 3D robot actually shows. */
export interface RobotLookFields {
  id: string
  name: string
  status: string
  color: string
  district: string
  cpu: number
  currentTask: string | null
  /** Skins (neon, chrome, gold) change the robot art, like the 2D map. */
  appearance?: { skin?: string | null } | null
}

/**
 * True when two agent snapshots draw the same robot. The city refreshes every
 * agent object about once a second (CPU drifts, tasks progress); robots only
 * re-render for what they show. CPU and task appear only in the expanded label.
 */
export function sameRobotLook(a: RobotLookFields, b: RobotLookFields, expanded: boolean): boolean {
  if (a === b) return true
  const base =
    a.id === b.id &&
    a.name === b.name &&
    a.status === b.status &&
    a.color === b.color &&
    a.district === b.district &&
    a.appearance?.skin === b.appearance?.skin
  if (!base || !expanded) return base
  return Math.round(a.cpu) === Math.round(b.cpu) && a.currentTask === b.currentTask
}

export const LABEL_LIFT_STEP = 0.55
export const LABEL_LIFT_LEVELS = 3

/**
 * Small vertical offsets so robots sharing a district do not stack their name
 * labels on the same line. Agents are ranked by id within their district, so the
 * offsets stay stable while statuses change.
 */
export function getLabelLifts(
  agents: readonly { id: string; district: string }[],
  step = LABEL_LIFT_STEP,
  levels = LABEL_LIFT_LEVELS,
): Map<string, number> {
  const byDistrict = new Map<string, string[]>()
  for (const agent of agents) {
    const ids = byDistrict.get(agent.district) ?? []
    ids.push(agent.id)
    byDistrict.set(agent.district, ids)
  }
  const lifts = new Map<string, number>()
  const safeLevels = Math.max(1, Math.floor(levels))
  for (const ids of byDistrict.values()) {
    ids.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    ids.forEach((id, index) => lifts.set(id, (index % safeLevels) * step))
  }
  return lifts
}

/**
 * District ambience volume from agent presence (the 3D twin of the 2D map's
 * audio focus): 0.18 floor, up to 1 for the busiest district.
 */
export function computeDistrictFocus<Id extends string>(
  agents: readonly { district: string; status: string }[],
  districtIds: readonly Id[],
): Map<Id, number> {
  const weights = new Map<string, number>(districtIds.map((id) => [id, 0]))
  for (const agent of agents) {
    if (agent.status === "offline" || !weights.has(agent.district)) continue
    const presence = agent.status === "working" || agent.status === "running" ? 1.5 : 1
    weights.set(agent.district, (weights.get(agent.district) ?? 0) + presence)
  }
  const maxWeight = Math.max(1, ...weights.values())
  const volumes = new Map<Id, number>()
  for (const id of districtIds) {
    volumes.set(id, 0.18 + 0.82 * ((weights.get(id) ?? 0) / maxWeight))
  }
  return volumes
}
