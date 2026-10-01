import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
vi.mock("better-auth", () => ({ betterAuth: () => ({ api: { getSession } }) }))
vi.mock("better-auth/next-js", () => ({ nextCookies: () => ({ id: "next-cookies" }) }))

import { GET } from "@/app/api/account/route"
import { getSessionUser, isGoogleConfigured } from "@/lib/auth/user-auth"
import { OPENROUTER_COOKIE } from "@/lib/connections/openrouter"
import { seal } from "@/lib/connections/sealed-cookie"

const env = { ...process.env }

describe("GET /api/account", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-account"
    process.env.GOOGLE_CLIENT_ID = "client-id"
    process.env.GOOGLE_CLIENT_SECRET = "client-secret"
    getSession.mockReset()
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it("reports the signed-in user and connected OpenRouter without secrets", async () => {
    getSession.mockResolvedValue({ user: { name: "Leo", email: "leo@example.test", image: null } })
    const cookie = `${OPENROUTER_COOKIE}=${encodeURIComponent(seal({ key: "sk-or-v1-secret", connectedAt: "2026-09-30T00:00:00.000Z" }))}`
    const res = await GET(new Request("https://agentic-city.test/api/account", { headers: { cookie } }))
    const text = await res.text()

    expect(JSON.parse(text)).toEqual({
      user: { name: "Leo", email: "leo@example.test", image: null },
      google: { enabled: true },
      openrouter: { enabled: true, connected: true, connectedAt: "2026-09-30T00:00:00.000Z" },
    })
    expect(text).not.toContain("sk-or")
  })

  it("reports anonymous visitors and unconfigured providers", async () => {
    getSession.mockResolvedValue(null)
    delete process.env.GOOGLE_CLIENT_ID
    const data = await (await GET(new Request("https://agentic-city.test/api/account"))).json()
    expect(data).toEqual({ user: null, google: { enabled: false }, openrouter: { enabled: true, connected: false, connectedAt: null } })
  })

  it("treats session errors and a missing secret as signed out", async () => {
    getSession.mockRejectedValue(new Error("bad cookie"))
    expect(await getSessionUser(new Headers())).toBeNull()
    delete process.env.BETTER_AUTH_SECRET
    expect(await getSessionUser(new Headers())).toBeNull()
    expect(isGoogleConfigured()).toBe(true)
    const data = await (await GET(new Request("https://agentic-city.test/api/account"))).json()
    expect(data.openrouter).toEqual({ enabled: false, connected: false, connectedAt: null })
    expect(data.google.enabled).toBe(false)
  })
})
