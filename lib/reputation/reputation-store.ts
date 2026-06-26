import type { ReputationAction } from '@/lib/protocols/track8004'

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

const MAX_REPUTATION_SCORE = 1300
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
    tasksCompleted: 0,
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

export function calculateReputationScore(metrics: Partial<ReputationMetrics>): number {
  const safe = normaliseMetrics(metrics)
  const taskPoints = Math.min(500, safe.tasksCompleted)
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

function snapshot(actorId: string, metrics: Partial<ReputationMetrics>, updatedAt = new Date().toISOString()): ReputationSnapshot {
  const normalised = normaliseMetrics(metrics)
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
  const existing = db.get(actorId)
  if (existing) return existing

  const created = snapshot(actorId, defaultMetrics())
  db.set(actorId, created)
  persist(db)
  return created
}

export function upsertReputationMetrics(actorId: string, metrics: Partial<ReputationMetrics>): ReputationSnapshot {
  const updated = snapshot(actorId, metrics)
  db.set(actorId, updated)
  persist(db)
  return updated
}

export function applyReputationAction(action: ReputationAction): ReputationSnapshot {
  const current = getReputation(action.actorId)
  const metrics = { ...current.metrics }

  if (action.reason.includes('task')) metrics.tasksCompleted += Math.max(0, Math.round(action.delta))
  else if (action.reason.includes('x402')) metrics.x402RevenueXlm += Math.max(0, action.delta / 10)
  else if (action.delta < 0) metrics.infractions += Math.max(1, Math.ceil(Math.abs(action.delta) / 10))
  else metrics.badges = [...metrics.badges, { id: `${action.reason}-${Date.now()}`, rarity: 'common', awardedAt: new Date().toISOString() }]

  return upsertReputationMetrics(action.actorId, metrics)
}

export function listReputations(limit = 50): ReputationSnapshot[] {
  return Array.from(db.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
