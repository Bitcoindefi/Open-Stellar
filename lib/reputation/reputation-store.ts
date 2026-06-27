import type { ReputationAction } from '@/lib/protocols/track8004'
import { addNotification } from '@/lib/notifications/notification-store'
import { getAgentUptime } from '@/lib/agents/agent-uptime-store'

export type ReputationTier = 'unrated' | 'bronze' | 'silver' | 'gold' | 'platinum'
export type ReputationBadgeRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface ReputationBadge {
  id: string
  rarity: ReputationBadgeRarity
  awardedAt: string
}

export interface ReputationMetrics {
  tasksCompleted: number
  x402RevenueXlm: number
  uptimeDaysWithoutErrors: number
  badges: ReputationBadge[]
  infractions: number
}

export interface ReputationSnapshot {
  actorId: string
  score: number
  tier: ReputationTier
  updatedAt: string
  metrics: ReputationMetrics
}

type ReputationDb = Map<string, ReputationSnapshot>

type PersistableState = Record<string, ReputationSnapshot>

const MAX_REPUTATION_SCORE = 1000
const BADGE_POINTS: Record<ReputationBadgeRarity, number> = {
  common: 5,
  rare: 20,
  epic: 50,
  legendary: 100,
}

const globalDb = globalThis as typeof globalThis & {
  __openStellarReputationDb__?: ReputationDb
  __openStellarReputationStorage__?: PersistableState
}

function defaultMetrics(): ReputationMetrics {
  return {
    tasksCompleted: 500,
    x402RevenueXlm: 0,
    uptimeDaysWithoutErrors: 0,
    badges: [],
    infractions: 0,
  }
}

function normaliseMetrics(metrics?: Partial<ReputationMetrics>): ReputationMetrics {
  return {
    tasksCompleted: Math.max(0, Math.floor(Number(metrics?.tasksCompleted ?? 0))),
    x402RevenueXlm: Math.max(0, Number(metrics?.x402RevenueXlm ?? 0)),
    uptimeDaysWithoutErrors: Math.max(0, Math.floor(Number(metrics?.uptimeDaysWithoutErrors ?? 0))),
    badges: Array.isArray(metrics?.badges) ? metrics.badges : [],
    infractions: Math.max(0, Math.floor(Number(metrics?.infractions ?? 0))),
  }
}

function normalizeActorId(actorId: string): string {
  const trimmed = actorId.trim()
  if (!trimmed) throw new Error("actorId must not be empty")
  return trimmed.slice(0, 200)
}

export function calculateReputationScore(metrics: Partial<ReputationMetrics>): number {
  const safe = normaliseMetrics(metrics)
  const taskPoints = safe.tasksCompleted
  const revenuePoints = Math.min(500, Math.floor(safe.x402RevenueXlm * 10))
  const uptimePoints = Math.min(200, safe.uptimeDaysWithoutErrors * 2)
  const badgePoints = safe.badges.reduce((sum, badge) => sum + BADGE_POINTS[badge.rarity], 0)
  const penaltyPoints = safe.infractions * 10

  return Math.max(0, Math.min(MAX_REPUTATION_SCORE, taskPoints + revenuePoints + uptimePoints + badgePoints - penaltyPoints))
}

export function getReputationTier(score: number): ReputationTier {
  if (score >= 1000) return 'platinum'
  if (score >= 500) return 'gold'
  if (score >= 200) return 'silver'
  if (score >= 50) return 'bronze'
  return 'unrated'
}

function persist(db: ReputationDb): void {
  globalDb.__openStellarReputationStorage__ = Object.fromEntries(db.entries())
}

function hydrateDb(): ReputationDb {
  if (globalDb.__openStellarReputationDb__) return globalDb.__openStellarReputationDb__
  const hydrated = new Map<string, ReputationSnapshot>(Object.entries(globalDb.__openStellarReputationStorage__ ?? {}))
  globalDb.__openStellarReputationDb__ = hydrated
  return hydrated
}

const db: ReputationDb = hydrateDb()

function metricsWithCurrentUptime(actorId: string, metrics: Partial<ReputationMetrics>): ReputationMetrics {
  const normalised = normaliseMetrics(metrics)
  return {
    ...normalised,
    uptimeDaysWithoutErrors: getAgentUptime(actorId)?.uptimeDays ?? 0,
  }
}

function snapshot(actorId: string, metrics: Partial<ReputationMetrics>, updatedAt = new Date().toISOString()): ReputationSnapshot {
  const normalised = metricsWithCurrentUptime(actorId, metrics)
  const score = calculateReputationScore(normalised)
  return {
    actorId,
    score,
    tier: getReputationTier(score),
    updatedAt,
    metrics: normalised,
  }
}

export function getReputation(actorId: string): ReputationSnapshot {
  const cleanId = normalizeActorId(actorId)
  const existing = db.get(cleanId)
  if (existing) return snapshot(cleanId, existing.metrics, existing.updatedAt)

  const created = snapshot(cleanId, defaultMetrics())
  db.set(cleanId, created)
  persist(db)
  return created
}

export function getReputationByActorId(actorId: string): ReputationSnapshot {
  return getReputation(actorId)
}

export function upsertReputationMetrics(actorId: string, metrics: Partial<ReputationMetrics>): ReputationSnapshot {
  const cleanId = normalizeActorId(actorId)
  const updated = snapshot(cleanId, metrics)
  db.set(cleanId, updated)
  persist(db)
  return updated
}

export function applyReputationAction(action: ReputationAction): ReputationSnapshot {
  const cleanId = normalizeActorId(action.actorId)
  const current = getReputation(cleanId)
  const metrics = { ...current.metrics }

  if (action.reason.includes('task') || action.reason === 'manual-update' || action.reason === 'perfect' || action.reason === 'good-service' || action.reason === 'voted') {
    metrics.tasksCompleted += Math.max(0, Math.round(action.delta))
  } else if (action.reason.includes('x402')) {
    metrics.x402RevenueXlm += Math.max(0, action.delta / 10)
  } else if (action.delta < 0) {
    metrics.infractions += Math.max(1, Math.ceil(Math.abs(action.delta) / 10))
  } else {
    metrics.badges = [...metrics.badges, { id: `${action.reason}-${Date.now()}`, rarity: 'common', awardedAt: new Date().toISOString() }]
  }

  const updated = upsertReputationMetrics(cleanId, metrics)
  addNotification({
    agentId: cleanId,
    type: 'reputation_updated',
    title: 'Reputation updated',
    body: `Reputation changed from ${current.score} to ${updated.score}.`,
    resourceHref: `/leaderboard/${cleanId}`,
    resourceLabel: 'Reputation',
    createdAt: updated.updatedAt,
    dedupeKey: `reputation_updated:${cleanId}:${updated.updatedAt}:${action.reason}:${action.delta}`,
  })
  return updated
}

export function listReputations(limit = 50): ReputationSnapshot[] {
  return Array.from(db.values())
    .map((entry) => snapshot(entry.actorId, entry.metrics, entry.updatedAt))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
