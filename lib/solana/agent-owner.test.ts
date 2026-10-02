import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const userAuth = vi.hoisted(() => ({ getSessionUser: vi.fn(), isGoogleConfigured: vi.fn() }))
vi.mock("@/lib/auth/user-auth", () => userAuth)

import { browserOwner, isOwnerTag, ownerTagFor, resolveAgentOwner, scopedAgentKey } from "@/lib/solana/agent-owner"
import { BROWSER_ID_COOKIE, browserIdCookie } from "@/lib/identity/browser-id"

const ORIGIN = "https://agentic-city.test"

describe("agent owner", () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.SOLANA_SERVER_SECRET = JSON.stringify(Array.from({ length: 64 }, (_, i) => i))
    process.env.BETTER_AUTH_SECRET = "owner-test-secret"
    userAuth.getSessionUser.mockReset().mockResolvedValue(null)
    userAuth.isGoogleConfigured.mockReset().mockReturnValue(false)
  })
  afterEach(() => { process.env = { ...env } })

  it("derives a stable, keyed 20-hex tag", () => {
    const tag = ownerTagFor("google:ana@example.com")
    expect(isOwnerTag(tag)).toBe(true)
    expect(ownerTagFor("google:ana@example.com")).toBe(tag)
    expect(ownerTagFor("google:bob@example.com")).not.toBe(tag)
    expect(ownerTagFor("")).toBeNull()
    delete process.env.SOLANA_SERVER_SECRET
    expect(ownerTagFor("google:ana@example.com")).toBeNull()
    expect(isOwnerTag("xyz")).toBe(false)
    expect(isOwnerTag(null)).toBe(false)
  })

  const browserCookie = (id: string) => `${BROWSER_ID_COOKIE}=${encodeURIComponent(browserIdCookie(id).value)}`

  it("uses the anonymous browser id: no sign-in needed", async () => {
    expect(await resolveAgentOwner(new Request(ORIGIN))).toBeNull()
    const id = "1".repeat(32)
    const owner = await resolveAgentOwner(new Request(ORIGIN, { headers: { cookie: browserCookie(id) } }))
    expect(owner).toEqual({ kind: "browser", tag: ownerTagFor(`browser:${id}`) })
    expect(owner).toEqual(browserOwner(id))
    // Another browser is another owner; a forged cookie is nobody.
    expect(await resolveAgentOwner(new Request(ORIGIN, { headers: { cookie: browserCookie("2".repeat(32)) } }))).not.toEqual(owner)
    expect(await resolveAgentOwner(new Request(ORIGIN, { headers: { cookie: `${BROWSER_ID_COOKIE}=${"1".repeat(32)}` } }))).toBeNull()
  })

  it("prefers the Google account for people who chose to sign in", async () => {
    userAuth.isGoogleConfigured.mockReturnValue(true)
    const cookie = browserCookie("3".repeat(32))
    expect(await resolveAgentOwner(new Request(ORIGIN, { headers: { cookie } }))).toEqual({ kind: "browser", tag: ownerTagFor(`browser:${"3".repeat(32)}`) })
    userAuth.getSessionUser.mockResolvedValue({ name: "Ana", email: "Ana@Example.com ", image: null })
    expect(await resolveAgentOwner(new Request(ORIGIN, { headers: { cookie } }))).toEqual({ kind: "google", tag: ownerTagFor("google:ana@example.com") })
    userAuth.getSessionUser.mockRejectedValue(new Error("auth db down"))
    expect(await resolveAgentOwner(new Request(ORIGIN, { headers: { cookie } }))).toMatchObject({ kind: "browser" })
  })

  it("has no browser owner without the server key", () => {
    delete process.env.SOLANA_SERVER_SECRET
    expect(browserOwner("4".repeat(32))).toBeNull()
  })

  it("builds scoped agent keys", () => {
    expect(scopedAgentKey(" worker-1 ", "a".repeat(20))).toBe(`${"a".repeat(20)}/worker-1`)
    expect(scopedAgentKey("worker-1", null)).toBe("legacy/worker-1")
    expect(scopedAgentKey("worker-1", "bad")).toBe("legacy/worker-1")
  })
})
