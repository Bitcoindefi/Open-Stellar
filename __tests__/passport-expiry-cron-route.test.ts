import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/cron/passport-expiry/route"
import {
  resetPassportExpiryStore,
  seedPassportExpiryRecord,
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

describe("GET /api/cron/passport-expiry", () => {
  beforeEach(() => {
    passportCounter = 0
    resetPassportExpiryStore()
  })

  afterEach(() => {
    resetPassportExpiryStore()
  })

  it("returns 401 when CRON_SECRET is set and no auth header", async () => {
    const originalSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-secret"

    const req = new Request("http://localhost/api/cron/passport-expiry")
    const res = await GET(req)
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe("Unauthorized cron request")

    process.env.CRON_SECRET = originalSecret
  })

  it("returns 200 with correct Bearer token", async () => {
    const originalSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-secret"

    const past = Date.now() - 1000
    seedPassportExpiryRecord(makePassport({ expiresAt: new Date(past).toISOString() }))

    const req = new Request("http://localhost/api/cron/passport-expiry", {
      headers: { authorization: "Bearer test-secret" },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.expired).toBe(1)
    expect(body.checkedAt).toBeDefined()
    expect(body.checkedCount).toBe(1)

    process.env.CRON_SECRET = originalSecret
  })

  it("returns 200 with no auth when CRON_SECRET is not set", async () => {
    const originalSecret = process.env.CRON_SECRET
    delete process.env.CRON_SECRET

    const req = new Request("http://localhost/api/cron/passport-expiry")
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)

    process.env.CRON_SECRET = originalSecret
  })

  it("returns correct expired count for multiple passports", async () => {
    const past = Date.now() - 1000
    const future = Date.now() + 86400000
    seedPassportExpiryRecord(makePassport({ agentId: "a1", expiresAt: new Date(past).toISOString() }))
    seedPassportExpiryRecord(makePassport({ agentId: "a2", expiresAt: new Date(past).toISOString() }))
    seedPassportExpiryRecord(makePassport({ agentId: "a3", expiresAt: new Date(future).toISOString() }))

    const req = new Request("http://localhost/api/cron/passport-expiry")
    const res = await GET(req)
    const body = await res.json()

    expect(body.expired).toBe(2)
    expect(body.checkedCount).toBe(3)
  })
})
