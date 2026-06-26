import type { AgentStatus } from "@/lib/types"

export const HEARTBEAT_INTERVAL_MS = 15_000
export const OFFLINE_AFTER_MS = 30_000
export const ALERT_AFTER_MS = 5 * 60_000

const VALID_AGENT_STATUSES: AgentStatus[] = ["active", "idle", "working", "error", "offline"]

export interface AgentHeartbeatInput {
  status?: unknown
  cpu?: unknown
  memory?: unknown
  currentTask?: unknown
  autoRestart?: unknown
  nowMs?: number
}

interface AgentHealthRecord {
  agentId: string
  runtimeStatus: AgentStatus
  lastHeartbeatMs: number
  firstHeartbeatMs: number
  cpu: number | null
  memory: number | null
  currentTask: string | null
  autoRestart: boolean
  offlineSinceMs: number | null
  restartAttempts: number
  lastRestartAttemptMs: number | null
}

export type AgentHealthStatus = "healthy" | "stale" | "offline"

export interface AgentHealthSnapshot {
  agentId: string
  status: AgentHealthStatus
  runtimeStatus: AgentStatus
  lastHeartbeat: string
  lastHeartbeatMs: number
  missedHeartbeats: number
  uptimeSeconds: number
  uptime: string
  cpu: number | null
  memory: number | null
  currentTask: string | null
  autoRestart: boolean
  restartAttempts: number
  offlineSince: string | null
  offlineForSeconds: number
  lastRestartAttempt: string | null
  alertSeverity: "error" | null
}

export interface AgentHealthEvent {
  type: "agent.status" | "agent.restart"
  agentId: string
  status?: AgentStatus
  at: string
  reason: string
}

export interface HealthCheckResult {
  checkedAt: string
  checkedAgents: number
  offlineAgents: AgentHealthSnapshot[]
  restartedAgents: AgentHealthSnapshot[]
  alerts: AgentHealthSnapshot[]
  events: AgentHealthEvent[]
}

type AgentHealthDb = Map<string, AgentHealthRecord>

const globalHealth = globalThis as typeof globalThis & {
  __openStellarAgentHealthDb__?: AgentHealthDb
  __openStellarAgentHealthEvents__?: AgentHealthEvent[]
}

const db: AgentHealthDb = globalHealth.__openStellarAgentHealthDb__ ?? new Map()
if (!globalHealth.__openStellarAgentHealthDb__) {
  globalHealth.__openStellarAgentHealthDb__ = db
}

const events: AgentHealthEvent[] = globalHealth.__openStellarAgentHealthEvents__ ?? []
if (!globalHealth.__openStellarAgentHealthEvents__) {
  globalHealth.__openStellarAgentHealthEvents__ = events
}

function normalizeStatus(status: unknown): AgentStatus {
  return VALID_AGENT_STATUSES.includes(status as AgentStatus) ? (status as AgentStatus) : "active"
}

function normalizePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function normalizeTask(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const task = String(value).trim()
  return task.length > 0 ? task.slice(0, 180) : null
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function pushEvent(event: AgentHealthEvent) {
  events.push(event)
  if (events.length > 100) {
    events.splice(0, events.length - 100)
  }
}

function toSnapshot(record: AgentHealthRecord, nowMs: number): AgentHealthSnapshot {
  const ageMs = Math.max(0, nowMs - record.lastHeartbeatMs)
  const missedHeartbeats = Math.max(0, Math.floor(ageMs / HEARTBEAT_INTERVAL_MS))
  const inferredOfflineSinceMs = record.offlineSinceMs ?? record.lastHeartbeatMs + OFFLINE_AFTER_MS
  const isOffline = record.runtimeStatus === "offline" || ageMs > OFFLINE_AFTER_MS
  const status: AgentHealthStatus = isOffline
    ? "offline"
    : ageMs > HEARTBEAT_INTERVAL_MS * 2
      ? "stale"
      : "healthy"
  const offlineSinceMs = status === "offline" ? inferredOfflineSinceMs : null
  const offlineForSeconds = offlineSinceMs ? Math.max(0, Math.floor((nowMs - offlineSinceMs) / 1000)) : 0
  const uptimeSeconds = Math.max(0, Math.floor((nowMs - record.firstHeartbeatMs) / 1000))

  return {
    agentId: record.agentId,
    status,
    runtimeStatus: record.runtimeStatus,
    lastHeartbeat: new Date(record.lastHeartbeatMs).toISOString(),
    lastHeartbeatMs: record.lastHeartbeatMs,
    missedHeartbeats,
    uptimeSeconds,
    uptime: formatDuration(uptimeSeconds),
    cpu: record.cpu,
    memory: record.memory,
    currentTask: record.currentTask,
    autoRestart: record.autoRestart,
    restartAttempts: record.restartAttempts,
    offlineSince: offlineSinceMs ? new Date(offlineSinceMs).toISOString() : null,
    offlineForSeconds,
    lastRestartAttempt: record.lastRestartAttemptMs ? new Date(record.lastRestartAttemptMs).toISOString() : null,
    alertSeverity: offlineForSeconds * 1000 >= ALERT_AFTER_MS ? "error" : null,
  }
}

export function recordAgentHeartbeat(agentId: string, input: AgentHeartbeatInput = {}): AgentHealthSnapshot {
  const cleanId = agentId.trim()
  if (!cleanId) throw new Error("agentId is required")

  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now()
  const current = db.get(cleanId)
  const runtimeStatus = normalizeStatus(input.status)
  const record: AgentHealthRecord = {
    agentId: cleanId,
    runtimeStatus,
    lastHeartbeatMs: nowMs,
    firstHeartbeatMs: current?.firstHeartbeatMs ?? nowMs,
    cpu: normalizePercent(input.cpu) ?? current?.cpu ?? null,
    memory: normalizePercent(input.memory) ?? current?.memory ?? null,
    currentTask: normalizeTask(input.currentTask) ?? current?.currentTask ?? null,
    autoRestart: typeof input.autoRestart === "boolean" ? input.autoRestart : current?.autoRestart ?? false,
    offlineSinceMs: runtimeStatus === "offline" ? current?.offlineSinceMs ?? nowMs : null,
    restartAttempts: current?.restartAttempts ?? 0,
    lastRestartAttemptMs: runtimeStatus === "offline" ? current?.lastRestartAttemptMs ?? null : null,
  }

  db.set(cleanId, record)
  return toSnapshot(record, nowMs)
}

export function getAgentHealth(agentId: string, nowMs = Date.now()): AgentHealthSnapshot | null {
  const record = db.get(agentId.trim())
  return record ? toSnapshot(record, nowMs) : null
}

export function listAgentHealth(nowMs = Date.now()): AgentHealthSnapshot[] {
  return Array.from(db.values())
    .map((record) => toSnapshot(record, nowMs))
    .sort((a, b) => a.agentId.localeCompare(b.agentId))
}

export function runAgentHealthCheck(nowMs = Date.now()): HealthCheckResult {
  const checkEvents: AgentHealthEvent[] = []
  const offlineAgents: AgentHealthSnapshot[] = []
  const restartedAgents: AgentHealthSnapshot[] = []
  const alerts: AgentHealthSnapshot[] = []

  for (const record of db.values()) {
    const staleMs = nowMs - record.lastHeartbeatMs

    if (staleMs > OFFLINE_AFTER_MS) {
      if (record.runtimeStatus !== "offline") {
        record.runtimeStatus = "offline"
        record.offlineSinceMs = record.lastHeartbeatMs + OFFLINE_AFTER_MS
        const event: AgentHealthEvent = {
          type: "agent.status",
          agentId: record.agentId,
          status: "offline",
          at: new Date(nowMs).toISOString(),
          reason: "missed heartbeat threshold",
        }
        pushEvent(event)
        checkEvents.push(event)
      }

      if (record.autoRestart && record.lastRestartAttemptMs === null) {
        record.restartAttempts += 1
        record.lastRestartAttemptMs = nowMs
        const event: AgentHealthEvent = {
          type: "agent.restart",
          agentId: record.agentId,
          at: new Date(nowMs).toISOString(),
          reason: "autoRestart requested after offline detection",
        }
        pushEvent(event)
        checkEvents.push(event)
      }
    }

    const snapshot = toSnapshot(record, nowMs)
    if (snapshot.status === "offline") {
      offlineAgents.push(snapshot)
      if (snapshot.autoRestart && snapshot.lastRestartAttempt) {
        restartedAgents.push(snapshot)
      }
      if (snapshot.alertSeverity === "error") {
        alerts.push(snapshot)
      }
    }
  }

  return {
    checkedAt: new Date(nowMs).toISOString(),
    checkedAgents: db.size,
    offlineAgents,
    restartedAgents,
    alerts,
    events: checkEvents,
  }
}

export function listAgentHealthEvents(limit = 50): AgentHealthEvent[] {
  return events.slice(-limit).reverse()
}

export function resetAgentHealthStore() {
  db.clear()
  events.splice(0, events.length)
}

export function seedAgentHealthRecord(agentId: string, input: AgentHeartbeatInput = {}): AgentHealthSnapshot {
  return recordAgentHeartbeat(agentId, input)
}
