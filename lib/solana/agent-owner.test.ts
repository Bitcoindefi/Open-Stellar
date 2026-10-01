import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const userAuth = vi.hoisted(() => ({ getSessionUser: vi.fn(), isGoogleConfigured: vi.fn() }))
vi.mock("@/lib/auth/user-auth", () => userAuth)

import { isOwnerTag, ownerTagFor, resolveAgentOwner, scopedAgentKey } from "@/lib/solana/agent-owner"
import { OPENROUTER_COOKIE } from "@/lib/connections/openrouter"
import { seal } from "@/lib/connections/sealed-cookie"

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

  it("uses the Google account when Google sign-in is configured", async () => {
    userAuth.isGoogleConfigured.mockReturnValue(true)
    expect(await resolveAgentOwner(new Request(ORIGIN))).toBeNull()
    userAuth.getSessionUser.mockResolvedValue({ name: "Ana", email: "Ana@Example.com ", image: null })
    expect(await resolveAgentOwner(new Request(ORIGIN))).toEqual({ kind: "google", tag: ownerTagFor("google:ana@example.com") })
  })

  it("falls back to the OpenRouter connection when Google is not configured", async () => {
    expect(await resolveAgentOwner(new Request(ORIGIN))).toBeNull()
    const cookie = `${OPENROUTER_COOKIE}=${encodeURIComponent(seal({ key: "sk-or-v1-abcdef", connectedAt: "now" }))}`
    expect(await resolveAgentOwner(new Request(ORIGIN, { headers: { cookie } }))).toEqual({ kind: "openrouter", tag: ownerTagFor("openrouter:sk-or-v1-abcdef") })
  })

  it("builds scoped agent keys", () => {
    expect(scopedAgentKey(" worker-1 ", "a".repeat(20))).toBe(`${"a".repeat(20)}/worker-1`)
    expect(scopedAgentKey("worker-1", null)).toBe("legacy/worker-1")
    expect(scopedAgentKey("worker-1", "bad")).toBe("legacy/worker-1")
  })
})
