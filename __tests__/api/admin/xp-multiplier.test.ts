import { describe, expect, it, beforeEach } from "vitest"
import { POST, DELETE, GET } from "@/app/api/admin/xp-multiplier/route"
import { resetXPMultiplierForTests } from "@/lib/gamification/xp-multiplier"

const adminUrl = "http://localhost/api/admin/xp-multiplier"

beforeEach(() => {
  resetXPMultiplierForTests()
})

describe("POST /api/admin/xp-multiplier", () => {
  it("returns 401 without x-admin-key header", async () => {
    const req = new Request(adminUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ multiplier: 2, durationMs: 60_000, reason: "test" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 401 with wrong x-admin-key", async () => {
    const req = new Request(adminUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "wrong-key" },
      body: JSON.stringify({ multiplier: 2, durationMs: 60_000, reason: "test" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("sets a valid multiplier when authorized", async () => {
    process.env.ADMIN_API_KEY = "test-key-123"
    const req = new Request(adminUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "test-key-123" },
      body: JSON.stringify({ multiplier: 2, durationMs: 60_000, reason: "hackathon" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.active).toBe(true)
    expect(body.multiplier).toBe(2)
    expect(body.reason).toBe("hackathon")
    expect(typeof body.validUntil).toBe("number")
    delete process.env.ADMIN_API_KEY
  })

  it("rejects multiplier > 10", async () => {
    process.env.ADMIN_API_KEY = "test-key"
    const req = new Request(adminUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "test-key" },
      body: JSON.stringify({ multiplier: 11, durationMs: 60_000, reason: "test" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    delete process.env.ADMIN_API_KEY
  })

  it("rejects multiplier < 1", async () => {
    process.env.ADMIN_API_KEY = "test-key"
    const req = new Request(adminUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "test-key" },
      body: JSON.stringify({ multiplier: 0, durationMs: 60_000, reason: "test" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    delete process.env.ADMIN_API_KEY
  })

  it("rejects durationMs > 7 days", async () => {
    process.env.ADMIN_API_KEY = "test-key"
    const req = new Request(adminUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "test-key" },
      body: JSON.stringify({ multiplier: 2, durationMs: 7 * 24 * 60 * 60 * 1000 + 1, reason: "test" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    delete process.env.ADMIN_API_KEY
  })

  it("rejects empty reason", async () => {
    process.env.ADMIN_API_KEY = "test-key"
    const req = new Request(adminUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "test-key" },
      body: JSON.stringify({ multiplier: 2, durationMs: 60_000, reason: "" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    delete process.env.ADMIN_API_KEY
  })
})

describe("DELETE /api/admin/xp-multiplier", () => {
  it("returns 401 without x-admin-key", async () => {
    const res = await DELETE(new Request(adminUrl, { method: "DELETE" }))
    expect(res.status).toBe(401)
  })

  it("clears the multiplier when authorized", async () => {
    process.env.ADMIN_API_KEY = "test-key"
    const req = new Request(adminUrl, {
      method: "DELETE",
      headers: { "x-admin-key": "test-key" },
    })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.multiplier).toBe(1)
    delete process.env.ADMIN_API_KEY
  })
})

describe("GET /api/admin/xp-multiplier", () => {
  it("returns 401 without x-admin-key", async () => {
    const res = await GET(new Request(adminUrl))
    expect(res.status).toBe(401)
  })
})
