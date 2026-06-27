import type { AgentPassport } from "./passport"
import { getPassportStatus } from "./passport"

export interface PassportExpiryRecord {
  agentId: string
  passportId: string
  expiresAt: string
  status: "ACTIVE" | "EXPIRED" | "REVOKED"
  revokedAt: string | null
  revokedReason: string | null
}

export interface PassportExpiryCheckResult {
  checkedAt: string
  checkedCount: number
  expiredCount: number
  newlyRevoked: PassportExpiryRecord[]
  events: PassportExpiryEvent[]
}

export interface PassportExpiryEvent {
  type: "passport.expired" | "passport.revoked"
  agentId: string
  passportId: string
  at: string
  reason: string
}

interface PassportExpiryDb {
  passports: Map<string, PassportExpiryRecord>
  events: PassportExpiryEvent[]
  stats: {
    totalExpired: number
    totalRevoked: number
    lastCheckAt: string | null
  }
}

const globalState = globalThis as typeof globalThis & {
  __openStellarPassportExpiryDb__?: PassportExpiryDb
}

function getDb(): PassportExpiryDb {
  if (!globalState.__openStellarPassportExpiryDb__) {
    globalState.__openStellarPassportExpiryDb__ = {
      passports: new Map(),
      events: [],
      stats: { totalExpired: 0, totalRevoked: 0, lastCheckAt: null },
    }
  }
  return globalState.__openStellarPassportExpiryDb__
}

function pushEvent(event: PassportExpiryEvent) {
  const db = getDb()
  db.events.push(event)
  if (db.events.length > 500) {
    db.events.splice(0, db.events.length - 500)
  }
}

/**
 * Register a passport in the server-side expiry tracking store.
 * Called when a passport is minted or loaded from on-chain attestation.
 */
export function registerPassportForExpiry(passport: AgentPassport): PassportExpiryRecord {
  const db = getDb()
  const record: PassportExpiryRecord = {
    agentId: passport.agentId,
    passportId: passport.id,
    expiresAt: passport.expiresAt,
    status: passport.status,
    revokedAt: null,
    revokedReason: null,
  }
  db.passports.set(passport.id, record)
  return record
}

/**
 * Revoke a passport in the store. Idempotent — skips already-revoked.
 * Returns true if the passport was newly revoked, false if already revoked.
 */
export function revokePassportInStore(
  passportId: string,
  reason: string,
  nowMs = Date.now(),
): { wasRevoked: boolean; record: PassportExpiryRecord | null } {
  const db = getDb()
  const record = db.passports.get(passportId)
  if (!record) return { wasRevoked: false, record: null }
  if (record.status === "REVOKED") return { wasRevoked: false, record }

  record.status = "REVOKED"
  record.revokedAt = new Date(nowMs).toISOString()
  record.revokedReason = reason
  db.stats.totalRevoked += 1

  const event: PassportExpiryEvent = {
    type: "passport.revoked",
    agentId: record.agentId,
    passportId,
    at: new Date(nowMs).toISOString(),
    reason,
  }
  pushEvent(event)

  return { wasRevoked: true, record }
}

/**
 * Scan all passports and auto-revoke those past expiresAt.
 * Skips already-revoked passports (idempotent).
 */
export function runPassportExpiryCheck(nowMs = Date.now()): PassportExpiryCheckResult {
  const db = getDb()
  const checkedAt = new Date(nowMs).toISOString()
  const newlyRevoked: PassportExpiryRecord[] = []
  const checkEvents: PassportExpiryEvent[] = []

  for (const record of db.passports.values()) {
    if (record.status === "REVOKED") continue

    const expiresAtMs = new Date(record.expiresAt).getTime()
    if (expiresAtMs <= nowMs) {
      // Passport has expired — revoke it
      const { wasRevoked } = revokePassportInStore(record.passportId, "expired", nowMs)
      if (wasRevoked) {
        db.stats.totalExpired += 1
        const revokedRecord = db.passports.get(record.passportId)!
        newlyRevoked.push(revokedRecord)

        // Event tracked via passport.revoked in revokePassportInStore
      }
    }
  }

  db.stats.lastCheckAt = checkedAt

  return {
    checkedAt,
    checkedCount: db.passports.size,
    expiredCount: newlyRevoked.length,
    newlyRevoked,
    events: checkEvents,
  }
}

/**
 * List all tracked passports with their current status.
 */
export function listPassportExpiryRecords(): PassportExpiryRecord[] {
  return Array.from(getDb().passports.values()).sort((a, b) =>
    a.agentId.localeCompare(b.agentId),
  )
}

/**
 * Get expiry stats for the health endpoint.
 */
export function getPassportExpiryStats(): {
  total: number
  active: number
  expired: number
  revoked: number
  totalExpired: number
  totalRevoked: number
  lastCheckAt: string | null
} {
  const db = getDb()
  const all = Array.from(db.passports.values())
  return {
    total: all.length,
    active: all.filter((r) => r.status === "ACTIVE").length,
    expired: all.filter((r) => r.status === "EXPIRED").length,
    revoked: all.filter((r) => r.status === "REVOKED").length,
    totalExpired: db.stats.totalExpired,
    totalRevoked: db.stats.totalRevoked,
    lastCheckAt: db.stats.lastCheckAt,
  }
}

/**
 * List recent expiry events.
 */
export function listPassportExpiryEvents(limit = 50): PassportExpiryEvent[] {
  return getDb().events.slice(-limit).reverse()
}

/**
 * Reset the store (useful for tests).
 */
export function resetPassportExpiryStore() {
  const db = getDb()
  db.passports.clear()
  db.events.splice(0, db.events.length)
  db.stats = { totalExpired: 0, totalRevoked: 0, lastCheckAt: null }
}

/**
 * Seed a passport record (useful for tests).
 */
export function seedPassportExpiryRecord(passport: AgentPassport): PassportExpiryRecord {
  return registerPassportForExpiry(passport)
}
