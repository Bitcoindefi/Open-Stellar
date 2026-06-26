import { createAgents } from "@/lib/data"

export interface AgentPosition {
  agentId: string
  pixelX: number
  pixelY: number
  targetX: number
  targetY: number
  direction: "left" | "right"
  updatedAt: string
}

export interface AgentPositionDelta {
  agentId: string
  dx: number
  dy: number
  pixelX: number
  pixelY: number
  targetX: number
  targetY: number
  direction: "left" | "right"
  updatedAt: string
}

export interface AgentPositionDeltaEvent {
  type: "agent.position"
  id: string
  occurredAt: string
  agents: AgentPositionDelta[]
}

export interface AgentPositionSnapshotEvent {
  type: "agent.positions.snapshot"
  occurredAt: string
  positions: AgentPosition[]
}

export interface AgentMoveInput {
  dx: unknown
  dy: unknown
}

type AgentPositionListener = (event: AgentPositionDeltaEvent) => void

interface AgentPositionState {
  positions: Map<string, AgentPosition>
  listeners: Set<AgentPositionListener>
  sequence: number
}

const globalState = globalThis as typeof globalThis & {
  __openStellarAgentPositions__?: AgentPositionState
}

const state: AgentPositionState = globalState.__openStellarAgentPositions__ ?? {
  positions: new Map<string, AgentPosition>(),
  listeners: new Set<AgentPositionListener>(),
  sequence: 0,
}

if (!globalState.__openStellarAgentPositions__) {
  globalState.__openStellarAgentPositions__ = state
}

function ensureSeededPositions(): void {
  if (state.positions.size > 0) return

  const now = new Date().toISOString()
  for (const agent of createAgents()) {
    state.positions.set(agent.id, {
      agentId: agent.id,
      pixelX: agent.pixelX,
      pixelY: agent.pixelY,
      targetX: agent.targetX,
      targetY: agent.targetY,
      direction: agent.direction,
      updatedAt: now,
    })
  }
}

function normalizeAgentId(agentId: string): string {
  const cleanId = agentId.trim()
  if (!cleanId) throw new Error("agentId is required")
  return cleanId
}

function normalizeDelta(value: unknown, field: "dx" | "dy"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`)
  }
  return value
}

function nextEventId(): string {
  state.sequence += 1
  return `agent.position:${Date.now()}:${state.sequence}`
}

function publishDelta(delta: AgentPositionDelta): AgentPositionDeltaEvent {
  const event: AgentPositionDeltaEvent = {
    type: "agent.position",
    id: nextEventId(),
    occurredAt: delta.updatedAt,
    agents: [delta],
  }

  for (const listener of state.listeners) {
    listener(event)
  }

  return event
}

export function listAgentPositions(): AgentPosition[] {
  ensureSeededPositions()
  return Array.from(state.positions.values()).sort((a, b) => a.agentId.localeCompare(b.agentId))
}

export function getAgentPosition(agentId: string): AgentPosition | null {
  ensureSeededPositions()
  return state.positions.get(agentId.trim()) ?? null
}

export function moveAgentPosition(agentId: string, input: AgentMoveInput): AgentPosition {
  ensureSeededPositions()

  const cleanId = normalizeAgentId(agentId)
  const current = state.positions.get(cleanId)
  if (!current) {
    throw new Error("agent position not found")
  }

  const dx = normalizeDelta(input.dx, "dx")
  const dy = normalizeDelta(input.dy, "dy")
  const updatedAt = new Date().toISOString()
  const direction = dx < 0 ? "left" : dx > 0 ? "right" : current.direction
  const next: AgentPosition = {
    agentId: cleanId,
    pixelX: current.pixelX + dx,
    pixelY: current.pixelY + dy,
    targetX: current.targetX + dx,
    targetY: current.targetY + dy,
    direction,
    updatedAt,
  }

  state.positions.set(cleanId, next)
  publishDelta({
    ...next,
    dx,
    dy,
  })

  return next
}

export function createAgentPositionSnapshotEvent(): AgentPositionSnapshotEvent {
  return {
    type: "agent.positions.snapshot",
    occurredAt: new Date().toISOString(),
    positions: listAgentPositions(),
  }
}

export function subscribeAgentPositionDeltas(listener: AgentPositionListener): () => void {
  state.listeners.add(listener)
  return () => {
    state.listeners.delete(listener)
  }
}

export function resetAgentPositionStoreForTests(): void {
  state.positions.clear()
  state.listeners.clear()
  state.sequence = 0
}

export function setAgentPositionForTests(
  agentId: string,
  position: Omit<AgentPosition, "agentId" | "updatedAt"> & { updatedAt?: string },
): AgentPosition {
  const cleanId = normalizeAgentId(agentId)
  const next: AgentPosition = {
    agentId: cleanId,
    pixelX: position.pixelX,
    pixelY: position.pixelY,
    targetX: position.targetX,
    targetY: position.targetY,
    direction: position.direction,
    updatedAt: position.updatedAt ?? new Date().toISOString(),
  }
  state.positions.set(cleanId, next)
  return next
}
