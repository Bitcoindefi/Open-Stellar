import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { BROWSER_ID_COOKIE, BROWSER_ID_MAX_AGE, browserIdCookie, ensureBrowserId, isBrowserId, newBrowserId, readBrowserId } from "@/lib/identity/browser-id"
import { sealFor } from "@/lib/connections/sealed-cookie"

const ORIGIN = "https://agentic-city.test"
const withCookie = (value: string) => new Request(ORIGIN, { headers: { cookie: `${BROWSER_ID_COOKIE}=${encodeURIComponent(value)}` } })

describe("browser id", () => {
  const env = { ...process.env }
  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "browser-id-secret"
  })
  afterEach(() => { process.env = { ...env } })

  it("is a random 128-bit hex id", () => {
    const id = newBrowserId()
    expect(isBrowserId(id)).toBe(true)
    expect(newBrowserId()).not.toBe(id)
    expect(newBrowserId(() => Buffer.alloc(16, 0xab))).toBe("ab".repeat(16))
    for (const bad of ["", "xyz", "A".repeat(32), 1, null]) expect(isBrowserId(bad)).toBe(false)
  })

  it("lives sealed in a one-year cookie and reads back", () => {
    const id = "0123456789abcdef0123456789abcdef"
    const cookie = browserIdCookie(id, 1_700_000_000_000)
    expect(cookie).toMatchObject({ name: "ac_uid", maxAge: BROWSER_ID_MAX_AGE })
    expect(BROWSER_ID_MAX_AGE).toBe(365 * 24 * 60 * 60)
    expect(cookie.value).not.toContain(id)
    expect(readBrowserId(withCookie(cookie.value))).toEqual({ id, stale: false })
  })

  it("ignores a missing, forged or malformed cookie", () => {
    expect(readBrowserId(new Request(ORIGIN))).toBeNull()
    expect(readBrowserId(withCookie("0123456789abcdef0123456789abcdef"))).toBeNull()
    expect(readBrowserId(withCookie(sealFor("browser-id", { v: 1, id: "not-hex" })))).toBeNull()
    expect(readBrowserId(withCookie(sealFor("browser-id", { v: 2, id: "a".repeat(32) })))).toBeNull()
    expect(readBrowserId(withCookie(sealFor("agent-wallet", { v: 1, id: "a".repeat(32) })))).toBeNull()
  })

  it("creates an id on first use and keeps it afterwards", () => {
    const first = ensureBrowserId(new Request(ORIGIN))
    expect(first).toMatchObject({ created: true })
    expect(first?.cookie?.name).toBe("ac_uid")
    const again = ensureBrowserId(withCookie(first!.cookie!.value))
    expect(again).toEqual({ id: first!.id, cookie: null, created: false })
  })

  it("re-seals an id sealed with the previous secret", () => {
    const old = browserIdCookie("b".repeat(32)).value
    process.env.CONNECTIONS_SECRET = "rotated"
    process.env.CONNECTIONS_SECRET_PREVIOUS = "browser-id-secret"
    const result = ensureBrowserId(withCookie(old))
    expect(result).toMatchObject({ id: "b".repeat(32), created: false })
    expect(result?.cookie?.value).not.toBe(old)
    expect(readBrowserId(withCookie(result!.cookie!.value))).toEqual({ id: "b".repeat(32), stale: false })
  })

  it("is unavailable when the server has no sealing secret", () => {
    delete process.env.BETTER_AUTH_SECRET
    expect(ensureBrowserId(new Request(ORIGIN))).toBeNull()
  })
})
