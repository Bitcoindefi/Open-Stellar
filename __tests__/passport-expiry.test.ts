import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  resetPassportExpiryStore,
  seedPassportExpiryRecord,
  runPassportExpiryCheck,
  revokePassportInStore,
  getPassportExpiryStats,
  listPassportExpiryRecords,
} from "@/lib/passport/passport-store"
import type { AgentPassport } from "@/lib/passport/passport"

let passportCounter = 0

function makePassport(overrides: Partial<AgentPassport> = {}): AgentPassport {
  const now = Date.now()
  const counter = (passportCounter += 1)
  return {
    id: `testnet:agent-123:${now}:${counter}`,
    agentId: "agent-123",
    spendCap: "1000000000",
    registryRoot: "0xabc",
    nullifierHash: `0x${now}:${counter}`,
    issuedAt: new Date(now - 86400000).toISOString(),
    expiresAt: new Date(now + 86400000).toISOString(),
    status: "ACTIVE",
    network: "testnet",
    ...overrides,
  } as AgentPassport
}

describe("passport expiry cron", () => {
  beforeEach(() => {
    passportCounter = 0
    resetPassportExpiryStore()
  })

  afterEach(() => {
    resetPassportExpiryStore()
  })

  it("registers a passport and tracks its expiry", () => {
    const passport = makePassport()
    const record = seedPassportExpiryRecord(passport)

    expect(record.agentId).toBe("agent-123")
    expect(record.status).toBe("ACTIVE")
    expect(record.expiresAt).toBe(passport.expiresAt)
  })

  it("auto-revokes passports past expiresAt", () => {
    const past = Date.now() - 1000
    const passport = makePassport({
      expiresAt: new Date(past).toISOString(),
      status: "ACTIVE",
    })
    seedPassportExpiryRecord(passport)

    const result = runPassportExpiryCheck()

    expect(result.expiredCount).toBe(1)
    expect(result.newlyRevoked).toHaveLength(1)
    expect(result.newlyRevoked[0].status).toBe("REVOKED")
    expect(result.newlyRevoked[0].revokedReason).toBe("expired")
  })

  it("skips already-revoked passports (idempotent)", () => {
    const past = Date.now() - 1000
    const passport = makePassport({
      expiresAt: new Date(past).toISOString(),
      status: "ACTIVE",
    })
    seedPassportExpiryRecord(passport)

    // First run — should revoke
    const result1 = runPassportExpiryCheck()
    expect(result1.expiredCount).toBe(1)

    // Second run — should skip already revoked
    const result2 = runPassportExpiryCheck()
    expect(result2.expiredCount).toBe(0)
    expect(result2.newlyRevoked).toHaveLength(0)
  })

  it("does not revoke passports that are still valid", () => {
    const future = Date.now() + 86400000
    const passport = makePassport({
      expiresAt: new Date(future).toISOString(),
      status: "ACTIVE",
    })
    seedPassportExpiryRecord(passport)

    const result = runPassportExpiryCheck()

    expect(result.expiredCount).toBe(0)
    expect(result.newlyRevoked).toHaveLength(0)
  })

  it("returns count of newly expired passports in response", () => {
    const past = Date.now() - 1000
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(past).toISOString(), agentId: "agent-1" }))
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(past).toISOString(), agentId: "agent-2" }))
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(past + 2000).toISOString(), agentId: "agent-3" }))

    const result = runPassportExpiryCheck()

    expect(result.expiredCount).toBe(2)
    expect(result.checkedCount).toBe(3)
    expect(result.checkedAt).toBeDefined()
  })

  it("health endpoint shows expired count increases after cron runs", () => {
    const past = Date.now() - 1000
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(past).toISOString(), agentId: "agent-1" }))
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(past).toISOString(), agentId: "agent-2" }))
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(Date.now() + 86400000).toISOString(), agentId: "agent-3" }))

    const before = getPassportExpiryStats()
    expect(before.totalExpired).toBe(0)
    expect(before.revoked).toBe(0)
    expect(before.active).toBe(3)

    runPassportExpiryCheck()

    const after = getPassportExpiryStats()
    expect(after.totalExpired).toBe(2)
    expect(after.revoked).toBe(2)
    expect(after.active).toBe(1)
    expect(after.lastCheckAt).toBeDefined()
  })

  it("revokePassportInStore is idempotent", () => {
    const passport = makePassport({ status: "ACTIVE" })
    seedPassportExpiryRecord(passport)

    const r1 = revokePassportInStore(passport.id, "manual")
    expect(r1.wasRevoked).toBe(true)

    const r2 = revokePassportInStore(passport.id, "manual")
    expect(r2.wasRevoked).toBe(false)
  })

  it("handles empty store gracefully", () => {
    const result = runPassportExpiryCheck()
    expect(result.expiredCount).toBe(0)
    expect(result.checkedCount).toBe(0)
    expect(result.newlyRevoked).toHaveLength(0)
  })

  it("tracks multiple passports per agent independently", () => {
    const past = Date.now() - 1000
    const agentId = "agent-multi"
    const p1 = makePassport({ agentId, id: `testnet:${agentId}:nullifier-1`, expiresAt: new Date(past).toISOString() })
    const p2 = makePassport({ agentId, id: `testnet:${agentId}:nullifier-2`, expiresAt: new Date(past).toISOString() })
    seedPassportExpiryRecord(p1)
    seedPassportExpiryRecord(p2)

    const result = runPassportExpiryCheck()
    expect(result.expiredCount).toBe(2)
    expect(result.newlyRevoked[0].agentId).toBe(agentId)
    expect(result.newlyRevoked[1].agentId).toBe(agentId)
  })
})
