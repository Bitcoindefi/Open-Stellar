import { XP_DECAY_CONFIG } from "./xp-decay-config"
import { getAgentXP, awardXP, type AgentXPRecord } from "@/lib/gamification/xp"
import { publishSystemEvent } from "@/lib/events/system-events"

export interface XpHistoryEvent {
  type: "earned" | "decayed"
  delta: number
  reason: string
  timestamp: string
}

export interface XpDecayAuditEntry {
  action: "xp_decayed"
  agentId: string
  before: number
  after: number
  daysSinceLastEvent: number
  timestamp: string
}

interface AgentXpHistoryDb {
  events: XpHistoryEvent[]
  lastXpEventAt: string | null
}

type XpDecayAuditDb = XpDecayAuditEntry[]

const globalState = globalThis as typeof globalThis & {
  __openStellarAgentXpHistory__?: Map<string, AgentXpHistoryDb>
  __openStellarXpDecayAudit__?: XpDecayAuditDb
}

function getHistoryDb(): Map<string, AgentXpHistoryDb> {
  if (!globalState.__openStellarAgentXpHistory__) {
    globalState.__openStellarAgentXpHistory__ = new Map()
  }
  return globalState.__openStellarAgentXpHistory__
}

function getAuditDb(): XpDecayAuditDb {
  if (!globalState.__openStellarXpDecayAudit__) {
    globalState.__openStellarXpDecayAudit__ = []
  }
  return globalState.__openStellarXpDecayAudit__
}

function getOrCreateHistory(agentId: string): AgentXpHistoryDb {
  const db = getHistoryDb()
  const existing = db.get(agentId)
  if (existing) return existing
  const fresh: AgentXpHistoryDb = { events: [], lastXpEventAt: null }
  db.set(agentId, fresh)
  return fresh
}

export function recordXpEarnedEvent(
  agentId: string,
  delta: number,
  reason: string,
  timestamp: string = new Date().toISOString(),
): void {
  const history = getOrCreateHistory(agentId)
  history.events.push({ type: "earned", delta, reason, timestamp })
  history.lastXpEventAt = timestamp
}

export function recordXpDecayEvent(
  agentId: string,
  delta: number,
  reason: string,
  timestamp: string = new Date().toISOString(),
): void {
  const history = getOrCreateHistory(agentId)
  history.events.push({ type: "decayed", delta, reason, timestamp })
}

export function getAgentXpHistory(agentId: string): XpHistoryEvent[] {
  const history = getHistoryDb().get(agentId)
  if (!history) return []
  return [...history.events]
}

export function getLastXpEventAt(agentId: string): Date | null {
  const history = getHistoryDb().get(agentId)
  if (!history?.lastXpEventAt) return null
  return new Date(history.lastXpEventAt)
}

export function computeDecayAmount(
  currentXp: number,
  daysSinceLastEvent: number,
  halfLifeDays: number = XP_DECAY_CONFIG.halfLifeDays,
  minimumXp: number = XP_DECAY_CONFIG.minimumXp,
): number {
  if (currentXp <= minimumXp) return 0
  if (daysSinceLastEvent <= 0) return 0

  const decayFactor = Math.pow(0.5, daysSinceLastEvent / halfLifeDays)
  const newXp = Math.max(minimumXp, currentXp * decayFactor)
  const decayAmount = currentXp - newXp

  return Math.round(decayAmount)
}

export interface DecayResult {
  agentId: string
  decayed: boolean
  before: number
  after: number
  decayAmount: number
  daysSinceLastEvent: number
}

export function applyXpDecayToAgent(
  agentId: string,
  now: Date = new Date(),
): DecayResult {
  const agent = getAgentXP(agentId)
  const lastEvent = getLastXpEventAt(agentId)

  const result: DecayResult = {
    agentId,
    decayed: false,
    before: agent.xp,
    after: agent.xp,
    decayAmount: 0,
    daysSinceLastEvent: 0,
  }

  if (agent.xp <= XP_DECAY_CONFIG.minimumXp) return result
  if (!lastEvent) return result

  const msSinceLastEvent = now.getTime() - lastEvent.getTime()
  const daysSinceLastEvent = msSinceLastEvent / (1000 * 60 * 60 * 24)

  if (daysSinceLastEvent <= XP_DECAY_CONFIG.gracePeriodDays) return result

  const decayAmount = computeDecayAmount(agent.xp, daysSinceLastEvent)
  if (decayAmount <= 0) return result

  const newXp = Math.max(XP_DECAY_CONFIG.minimumXp, agent.xp - decayAmount)

  // Use awardXP with negative amount to update the record properly
  awardXP(agentId, -decayAmount, "task.completed")

  const timestamp = now.toISOString()
  recordXpDecayEvent(agentId, -decayAmount, "xp_decayed", timestamp)

  const audit: XpDecayAuditEntry = {
    action: "xp_decayed",
    agentId,
    before: agent.xp,
    after: newXp,
    daysSinceLastEvent: Math.floor(daysSinceLastEvent),
    timestamp,
  }
  getAuditDb().push(audit)

  return {
    agentId,
    decayed: true,
    before: agent.xp,
    after: newXp,
    decayAmount,
    daysSinceLastEvent: Math.floor(daysSinceLastEvent),
  }
}

export function runXpDecayCron(now: Date = new Date()): {
  processed: number
  decayed: number
  skipped: number
  agents: DecayResult[]
} {
  const db = (globalThis as typeof globalThis & {
    __openStellarAgentXpDb__?: Map<string, AgentXPRecord>
  }).__openStellarAgentXpDb__

  const agentIds = db ? Array.from(db.keys()) : []
  const results: DecayResult[] = []
  let decayedCount = 0
  let skippedCount = 0

  for (const agentId of agentIds) {
    const result = applyXpDecayToAgent(agentId, now)
    results.push(result)
    if (result.decayed) {
      decayedCount += 1
    } else {
      skippedCount += 1
    }
  }

  return {
    processed: agentIds.length,
    decayed: decayedCount,
    skipped: skippedCount,
    agents: results,
  }
}

export function getXpDecayAudit(): XpDecayAuditEntry[] {
  return [...getAuditDb()]
}

export function resetXpDecayStore(): void {
  getHistoryDb().clear()
  getAuditDb().splice(0, getAuditDb().length)
}