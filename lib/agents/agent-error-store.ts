import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { publishSystemEvent } from "@/lib/events/system-events"

export interface AgentErrorLogEntry {
  date: string
  agentId: string
  error: string
  taskExcerpt: string
}

export interface AgentHealthSummary {
  agentId: string
  status: "active" | "degraded"
  lastSeen: string | null
  errorCount24h: number
  degraded: boolean
}

const ERROR_LOG_PATH = join(process.cwd(), ".data", "agent-errors.json")
const MAX_ERROR_LOG_ENTRIES = 1000
const DAY_MS = 24 * 60 * 60 * 1000

const globalErrors = globalThis as typeof globalThis & {
  __openStellarAgentErrorState__?: Map<string, { lastSeen: string | null; degraded: boolean; consecutiveErrors: number }>
}

const state = globalErrors.__openStellarAgentErrorState__ ?? new Map<string, { lastSeen: string | null; degraded: boolean; consecutiveErrors: number }>()
if (!globalErrors.__openStellarAgentErrorState__) globalErrors.__openStellarAgentErrorState__ = state

function normalizeAgentId(agentId: string): string {
  const cleanId = agentId.trim()
  if (!cleanId) throw new Error("agentId must not be empty")
  return cleanId.slice(0, 200)
}

function truncate(value: string, length: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, length)
}

function readErrorLog(): AgentErrorLogEntry[] {
  if (!existsSync(ERROR_LOG_PATH)) return []
  try {
    const parsed = JSON.parse(readFileSync(ERROR_LOG_PATH, "utf8"))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is AgentErrorLogEntry => (
      typeof entry?.date === "string" &&
      typeof entry.agentId === "string" &&
      typeof entry.error === "string" &&
      typeof entry.taskExcerpt === "string"
    ))
  } catch {
    return []
  }
}

function writeErrorLogAtomically(entries: AgentErrorLogEntry[]): void {
  mkdirSync(dirname(ERROR_LOG_PATH), { recursive: true })
  const tmpPath = `${ERROR_LOG_PATH}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8")
  renameSync(tmpPath, ERROR_LOG_PATH)
}

function recentEntries(agentId: string, nowMs: number): AgentErrorLogEntry[] {
  const cutoff = nowMs - DAY_MS
  return readErrorLog().filter((entry) => entry.agentId === agentId && Date.parse(entry.date) >= cutoff)
}

export function recordAgentInvocation(agentId: string, now = new Date()): void {
  const cleanId = normalizeAgentId(agentId)
  const current = state.get(cleanId) ?? { lastSeen: null, degraded: false, consecutiveErrors: 0 }
  state.set(cleanId, { ...current, lastSeen: now.toISOString() })
}

export function recordAgentExecutionSuccess(agentId: string, now = new Date()): AgentHealthSummary {
  const cleanId = normalizeAgentId(agentId)
  const current = state.get(cleanId) ?? { lastSeen: null, degraded: false, consecutiveErrors: 0 }
  state.set(cleanId, { ...current, lastSeen: now.toISOString(), consecutiveErrors: 0 })
  return getAgentHealthSummary(cleanId, now.getTime())
}

export function recordAgentExecutionError(input: { agentId: string; error: unknown; taskExcerpt?: string; date?: Date }): AgentHealthSummary {
  const cleanId = normalizeAgentId(input.agentId)
  const date = input.date ?? new Date()
  const entry: AgentErrorLogEntry = {
    date: date.toISOString(),
    agentId: cleanId,
    error: truncate(input.error instanceof Error ? input.error.message : String(input.error || "Unknown error"), 500),
    taskExcerpt: truncate(input.taskExcerpt ?? "", 240),
  }

  const entries = [...readErrorLog(), entry].slice(-MAX_ERROR_LOG_ENTRIES)
  writeErrorLogAtomically(entries)

  const current = state.get(cleanId) ?? { lastSeen: null, degraded: false, consecutiveErrors: 0 }
  const consecutiveErrors = current.consecutiveErrors + 1
  const degraded = current.degraded || consecutiveErrors >= 3
  state.set(cleanId, { lastSeen: entry.date, degraded, consecutiveErrors })

  if (!current.degraded && degraded) {
    console.warn(`[agent-health] ${cleanId} marked degraded after 3 consecutive failed invocations`)
    publishSystemEvent({ type: "agent.status", agentId: cleanId, status: "degraded", occurredAt: entry.date })
  }

  return getAgentHealthSummary(cleanId, date.getTime())
}

export function getAgentErrorCount24h(agentId: string, nowMs = Date.now()): number {
  return recentEntries(normalizeAgentId(agentId), nowMs).length
}

export function getAgentHealthSummary(agentId: string, nowMs = Date.now()): AgentHealthSummary {
  const cleanId = normalizeAgentId(agentId)
  const current = state.get(cleanId) ?? { lastSeen: null, degraded: false, consecutiveErrors: 0 }
  return {
    agentId: cleanId,
    status: current.degraded ? "degraded" : "active",
    lastSeen: current.lastSeen,
    errorCount24h: getAgentErrorCount24h(cleanId, nowMs),
    degraded: current.degraded,
  }
}

export function resetAgentErrorStoreForTests(): void {
  state.clear()
  writeErrorLogAtomically([])
}
