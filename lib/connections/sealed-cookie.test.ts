import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendCookies, seal, sealFor, serializeCookie, unseal, unsealFor } from "@/lib/connections/sealed-cookie"

describe("sealed cookies by purpose", () => {
  const env = { ...process.env }
  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "purpose-test-secret"
  })
  afterEach(() => { process.env = { ...env } })

  it("keeps purposes apart: a value sealed for one cannot be opened as another", () => {
    const wallet = sealFor("agent-wallet", { seed: "s" })
    expect(unsealFor("agent-wallet", wallet)).toEqual({ value: { seed: "s" }, stale: false })
    expect(unsealFor("browser-id", wallet)).toBeNull()
    expect(unsealFor("connections", wallet)).toBeNull()
    expect(unseal(wallet)).toBeNull()
    // The legacy helpers are the "connections" purpose, so existing cookies still open.
    expect(unsealFor("connections", seal({ key: "k" }))?.value).toEqual({ key: "k" })
  })

  it("opens cookies sealed with the previous secret as stale, after a rotation", () => {
    const old = sealFor("agent-wallet", { n: 1 })
    process.env.CONNECTIONS_SECRET = "new-secret"
    expect(unsealFor("agent-wallet", old)).toBeNull()
    process.env.CONNECTIONS_SECRET_PREVIOUS = "purpose-test-secret"
    expect(unsealFor("agent-wallet", old)).toEqual({ value: { n: 1 }, stale: true })
    expect(unsealFor("agent-wallet", sealFor("agent-wallet", { n: 2 }))).toEqual({ value: { n: 2 }, stale: false })
    // A previous secret equal to the current one is not a second chance.
    process.env.CONNECTIONS_SECRET_PREVIOUS = "new-secret"
    expect(unsealFor("agent-wallet", old)).toBeNull()
  })

  it("opens nothing without a secret, and refuses short tokens", () => {
    const token = sealFor("browser-id", { id: "x" })
    delete process.env.BETTER_AUTH_SECRET
    expect(unsealFor("browser-id", token)).toBeNull()
    expect(() => sealFor("browser-id", {})).toThrow("BETTER_AUTH_SECRET")
    process.env.BETTER_AUTH_SECRET = "purpose-test-secret"
    expect(unsealFor("browser-id", "short")).toBeNull()
    expect(unsealFor("browser-id", null)).toBeNull()
  })

  it("serializes httpOnly cookies, Secure only on https", () => {
    const cookie = { name: "ac_uid", value: "a b", maxAge: 60.7 }
    expect(serializeCookie(new Request("https://a.test/x"), cookie)).toBe("ac_uid=a%20b; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure")
    expect(serializeCookie(new Request("http://localhost:3000/x"), { ...cookie, maxAge: -5 })).toBe("ac_uid=a%20b; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
    const headers = new Headers()
    appendCookies(new Request("https://a.test"), headers, [cookie, { ...cookie, name: "ac_agent_wallet" }])
    expect(headers.getSetCookie()).toHaveLength(2)
  })
})
