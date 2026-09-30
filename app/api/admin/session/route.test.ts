import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const verifyApiKey = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/api-keys", () => ({ verifyApiKey }))

import { DELETE, GET, POST } from "@/app/api/admin/session/route"
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/auth/admin-session"

const ADMIN_KEY = "osk_session_route_test_key"

function post(body: unknown) {
  return POST(new Request("https://agentic-city.test/api/admin/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))
}

describe("/api/admin/session", () => {
  const original = process.env.ADMIN_API_KEY

  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY
    verifyApiKey.mockReset()
  })
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_API_KEY
    else process.env.ADMIN_API_KEY = original
  })

  it("answers 503 when ADMIN_API_KEY is not configured", async () => {
    delete process.env.ADMIN_API_KEY
    const res = await post({ apiKey: "anything" })
    expect(res.status).toBe(503)
    expect(verifyApiKey).not.toHaveBeenCalled()
  })

  it("rejects missing and non-admin keys", async () => {
    expect((await post({})).status).toBe(401)
    verifyApiKey.mockResolvedValueOnce({ valid: true, isAdmin: false })
    expect((await post({ apiKey: "osk_live_not_admin" })).status).toBe(401)
    verifyApiKey.mockResolvedValueOnce({ valid: false, isAdmin: false })
    expect((await post({ apiKey: "osk_live_invalid" })).status).toBe(401)
  })

  it("sets an httpOnly strict session cookie for a valid admin key", async () => {
    verifyApiKey.mockResolvedValueOnce({ valid: true, isAdmin: true })
    const res = await post({ apiKey: ` ${ADMIN_KEY} ` })

    expect(res.status).toBe(200)
    expect(verifyApiKey).toHaveBeenCalledWith(ADMIN_KEY)
    const cookie = res.headers.get("set-cookie") ?? ""
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=`)
    expect(cookie.toLowerCase()).toContain("httponly")
    expect(cookie.toLowerCase()).toContain("samesite=strict")
    expect(cookie).toContain("Max-Age=28800")
  })

  it("reports whether the request carries a valid session", async () => {
    const token = createAdminSessionToken()
    const withCookie = await GET(new Request("https://agentic-city.test/api/admin/session", { headers: { cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}` } }))
    expect(await withCookie.json()).toEqual({ authenticated: true })

    const without = await GET(new Request("https://agentic-city.test/api/admin/session"))
    expect(await without.json()).toEqual({ authenticated: false })
  })

  it("clears the cookie on sign out", async () => {
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0")
  })
})
