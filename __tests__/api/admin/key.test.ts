import { afterEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/admin/key/route"

describe("GET /api/admin/key", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns 401 without a valid bearer token", async () => {
    vi.stubEnv("ADMIN_API_KEY", "osk_test_admin_key")

    const res = await GET(new Request("http://localhost/api/admin/key"))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ ok: false, error: "Unauthorized" })
  })

  it("returns the current server admin API key for authenticated requests", async () => {
    vi.stubEnv("ADMIN_API_KEY", "osk_test_admin_key")

    const res = await GET(new Request("http://localhost/api/admin/key", {
      headers: { Authorization: "Bearer osk_test_admin_key" },
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, key: "osk_test_admin_key" })
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })
})
