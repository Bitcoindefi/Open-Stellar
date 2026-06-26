import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
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

export interface AgentPositionHistoryRecord {
  agentId: string
  dx: number
  dy: number
  pixelX: number
  pixelY: number
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

export interface AgentPositionHistoryResult {
  positions: AgentPositionHistoryRecord[]
  total: number
  returned: number
  oldest: string | null
  newest: string | null
}

type AgentPositionListener = (event: AgentPositionDeltaEvent) => void

interface AgentPositionState {
  positions: Map<string, AgentPosition>
  listeners: Set<AgentPositionListener>
  sequence: number
  hydrated: boolean
}

const DEFAULT_HISTORY_LIMIT = 50
const MAX_HISTORY_LIMIT = 1000
const DEFAULT_POSITIONS_DIR = join(process.cwd(), ".data", "positions")

const globalState = globalThis as typeof globalThis & {
  __openStellarAgentPositions__?: AgentPositionState
}

const state: AgentPositionState = globalState.__openStellarAgentPositions__ ?? {
  positions: new Map(),
  listeners: new Set(),
  sequence: 0,
  hydrated: false,
}

if (!globalState.__openStellarAgentPositions__) {
  globalState.__openStellarAgentPositions__ = state
}

if (state.hydrated === undefined) {
  state.hydrated = false
}

let positionsDirectory = DEFAULT_POSITIONS_DIR

function ensureSeededPositions(): void {
  const now = new Date().toISOString()

  for (const agent of createAgents()) {
    if (state.positions.has(agent.id)) continue

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

function ensureInitializedPositions(): void {
  if (!state.hydrated) {
    hydratePositionsFromHistory()
    state.hydrated = true
  }

  ensureSeededPositions()
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

function agentHistoryPath(agentId: string): string {
  return join(positionsDirectory, `${encodeURIComponent(normalizeAgentId(agentId))}.jsonl`)
}

function ensurePositionsDirectory(): void {
  mkdirSync(positionsDirectory, { recursive: true })
}

function isDirection(value: unknown): value is "left" | "right" {
  return value === "left" || value === "right"
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function parseHistoryRecord(line: string): AgentPositionHistoryRecord | null {
  try {
    const parsed = JSON.parse(line) as Partial<AgentPositionHistoryRecord>
    if (
      typeof parsed.agentId !== "string" ||
      !parsed.agentId.trim() ||
      !isFiniteNumber(parsed.dx) ||
      !isFiniteNumber(parsed.dy) ||
      !isFiniteNumber(parsed.pixelX) ||
      !isFiniteNumber(parsed.pixelY) ||
      !isDirection(parsed.direction) ||
      typeof parsed.updatedAt !== "string" ||
      !parsed.updatedAt.trim()
    ) {
      return null
    }

    return {
      agentId: parsed.agentId,
      dx: parsed.dx,
      dy: parsed.dy,
      pixelX: parsed.pixelX,
      pixelY: parsed.pixelY,
      direction: parsed.direction,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

function readHistoryFile(agentId: string): AgentPositionHistoryRecord[] {
  const filePath = agentHistoryPath(agentId)
  if (!existsSync(filePath)) return []

  return readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map(parseHistoryRecord)
    .filter((record): record is AgentPositionHistoryRecord => record !== null)
}

function appendPositionHistory(record: AgentPositionHistoryRecord): void {
  ensurePositionsDirectory()

  const filePath = agentHistoryPath(record.agentId)
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8")

  const records = readHistoryFile(record.agentId)
  if (records.length > MAX_HISTORY_LIMIT) {
    writeFileSync(
      filePath,
      `${records.slice(-MAX_HISTORY_LIMIT).map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    )
  }
}

function latestValidHistoryRecord(filePath: string): AgentPositionHistoryRecord | null {
  if (!existsSync(filePath)) return null

  const lines = readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = parseHistoryRecord(lines[index])
    if (record) return record
  }

  return null
}

function hydratePositionsFromHistory(): void {
  if (!existsSync(positionsDirectory)) return

  for (const entry of readdirSync(positionsDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue

    const record = latestValidHistoryRecord(join(positionsDirectory, basename(entry.name)))
    if (!record) continue

    state.positions.set(record.agentId, {
      agentId: record.agentId,
      pixelX: record.pixelX,
      pixelY: record.pixelY,
      targetX: record.pixelX,
      targetY: record.pixelY,
      direction: record.direction,
      updatedAt: record.updatedAt,
    })
  }
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
  ensureInitializedPositions()
  return Array.from(state.positions.values()).sort((a, b) => a.agentId.localeCompare(b.agentId))
}

export function getAgentPosition(agentId: string): AgentPosition | null {
  ensureInitializedPositions()
  return state.positions.get(agentId.trim()) ?? null
}

export function moveAgentPosition(agentId: string, input: AgentMoveInput): AgentPosition {
  ensureInitializedPositions()

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

  appendPositionHistory({
    agentId: cleanId,
    dx,
    dy,
    pixelX: next.pixelX,
    pixelY: next.pixelY,
    direction: next.direction,
    updatedAt: next.updatedAt,
  })

  state.positions.set(cleanId, next)
  publishDelta({
    ...next,
    dx,
    dy,
  })

  return next
}

export function listAgentPositionHistory(agentId: string, limit = DEFAULT_HISTORY_LIMIT): AgentPositionHistoryRecord[] {
  const cleanId = normalizeAgentId(agentId)
  const safeLimit = normalizeAgentPositionHistoryLimit(limit)
  return readHistoryFile(cleanId).slice(-safeLimit).reverse()
}

/**
 * Paginated position history with before/after filtering and metadata.
 * Returns newest-first, capped at limit.
 * Preserves exact same slicing behavior as listAgentPositionHistory for backward compat.
 */
export function getAgentPositionHistoryPaginated(
  agentId: string,
  options: {
    limit?: number
    before?: string | null
    after?: string | null
  } = {},
): AgentPositionHistoryResult {
  const cleanId = normalizeAgentId(agentId)
  const all = readHistoryFile(cleanId)

  // Compute metadata from full unfiltered array
  const total = all.length
  const oldest = total > 0 ? all[0].updatedAt : null
  const newest = total > 0 ? all[total - 1].updatedAt : null

  // Apply before/after filters
  let filtered = all
  if (options.before) {
    const beforeMs = new Date(options.before).getTime()
    if (!Number.isNaN(beforeMs)) {
      filtered = filtered.filter((r) => new Date(r.updatedAt).getTime() < beforeMs)
    }
  }
  if (options.after) {
    const afterMs = new Date(options.after).getTime()
    if (!Number.isNaN(afterMs)) {
      filtered = filtered.filter((r) => new Date(r.updatedAt).getTime() > afterMs)
    }
  }

  // Use SAME slicing logic as listAgentPositionHistory for backward compat:
  // take last N records (newest), then reverse to newest-first
  const limit = normalizeAgentPositionHistoryLimit(options.limit)
  const positions = filtered.slice(-limit).reverse()

  return {
    positions,
    total,
    returned: positions.length,
    oldest,
    newest,
  }
}

export function normalizeAgentPositionHistoryLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_HISTORY_LIMIT
  }

  return Math.max(1, Math.min(Math.trunc(value), MAX_HISTORY_LIMIT))
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
  state.hydrated = false
}

export function setAgentPositionHistoryDirectoryForTests(directory: string): void {
  positionsDirectory = directory
  state.hydrated = false
}

export function resetAgentPositionHistoryDirectoryForTests(): void {
  positionsDirectory = DEFAULT_POSITIONS_DIR
  state.hydrated = false
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
