const DAY_MS = 24 * 60 * 60 * 1000

export interface AgentUptimeSnapshot {
  agentId: string
  firstSeenAt: string
  lastSeenAt: string
  uptimeDays: number
}

interface AgentUptimeRecord {
  agentId: string
  firstSeenMs: number
  lastSeenMs: number
  uptimeDays: number
}

type AgentUptimeDb = Map<string, AgentUptimeRecord>

const globalUptime = globalThis as typeof globalThis & {
  __openStellarAgentUptimeDb__?: AgentUptimeDb
}

const db: AgentUptimeDb = globalUptime.__openStellarAgentUptimeDb__ ?? new Map()
if (!globalUptime.__openStellarAgentUptimeDb__) {
  globalUptime.__openStellarAgentUptimeDb__ = db
}

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function toSnapshot(record: AgentUptimeRecord, nowMs: number): AgentUptimeSnapshot {
  const isExpired = nowMs - record.lastSeenMs > DAY_MS

  return {
    agentId: record.agentId,
    firstSeenAt: new Date(record.firstSeenMs).toISOString(),
    lastSeenAt: new Date(record.lastSeenMs).toISOString(),
    uptimeDays: isExpired ? 0 : record.uptimeDays,
  }
}

export function recordAgentUptimeHeartbeat(agentId: string, nowMs = Date.now()): AgentUptimeSnapshot {
  const cleanId = agentId.trim()
  if (!cleanId) throw new Error("agentId is required")

  const safeNowMs = Number.isFinite(nowMs) ? Number(nowMs) : Date.now()
  const current = db.get(cleanId)
  const shouldReset = !current || safeNowMs - current.lastSeenMs > DAY_MS

  if (shouldReset) {
    const record: AgentUptimeRecord = {
      agentId: cleanId,
      firstSeenMs: safeNowMs,
      lastSeenMs: safeNowMs,
      uptimeDays: 1,
    }
    db.set(cleanId, record)
    return toSnapshot(record, safeNowMs)
  }

  const previousDay = utcDayKey(current.lastSeenMs)
  const currentDay = utcDayKey(safeNowMs)
  if (currentDay !== previousDay) {
    current.uptimeDays += 1
  }
  current.lastSeenMs = safeNowMs

  return toSnapshot(current, safeNowMs)
}

export function getAgentUptime(agentId: string, nowMs = Date.now()): AgentUptimeSnapshot | null {
  const record = db.get(agentId.trim())
  return record ? toSnapshot(record, nowMs) : null
}

export function listAgentUptimes(nowMs = Date.now()): AgentUptimeSnapshot[] {
  return Array.from(db.values())
    .map((record) => toSnapshot(record, nowMs))
    .sort((a, b) => a.agentId.localeCompare(b.agentId))
}

export function resetAgentUptimeStore(): void {
  db.clear()
}
