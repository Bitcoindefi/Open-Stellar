import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/protocol/passport/health/route"
import {
  resetPassportExpiryStore,
  seedPassportExpiryRecord,
  runPassportExpiryCheck,
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

describe("GET /api/protocol/passport/health", () => {
  beforeEach(() => {
    passportCounter = 0
    resetPassportExpiryStore()
  })

  afterEach(() => {
    resetPassportExpiryStore()
  })

  it("returns stats with zero values when store is empty", async () => {
    const req = new Request("http://localhost/api/protocol/passport/health")
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.stats).toEqual({
      total: 0,
      active: 0,
      expired: 0,
      revoked: 0,
      totalExpired: 0,
      totalRevoked: 0,
      lastCheckAt: null,
    })
    expect(body.recentEvents).toEqual([])
  })

  it("shows expired count increases after cron runs", async () => {
    const past = Date.now() - 1000
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(past).toISOString(), agentId: "agent-1" }))
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(past).toISOString(), agentId: "agent-2" }))
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(Date.now() + 86400000).toISOString(), agentId: "agent-3" }))

    // Before cron
    const req1 = new Request("http://localhost/api/protocol/passport/health")
    const res1 = await GET(req1)
    const body1 = await res1.json()
    expect(body1.stats.totalExpired).toBe(0)
    expect(body1.stats.revoked).toBe(0)
    expect(body1.stats.active).toBe(3)

    // Run cron
    runPassportExpiryCheck()

    // After cron
    const req2 = new Request("http://localhost/api/protocol/passport/health")
    const res2 = await GET(req2)
    const body2 = await res2.json()
    expect(body2.stats.totalExpired).toBe(2)
    expect(body2.stats.revoked).toBe(2)
    expect(body2.stats.active).toBe(1)
    expect(body2.stats.lastCheckAt).toBeDefined()
    expect(body2.recentEvents).toHaveLength(2)
  })
})
