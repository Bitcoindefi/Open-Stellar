import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  AGENT_WALLET_COOKIE,
  AGENT_WALLET_MAX_AGE,
  agentWalletCookie,
  createAgentWallet,
  readAgentWallet,
  resolveAgentWallet,
  signerFor,
} from "@/lib/agent-wallet/cookie"
import { BROWSER_ID_COOKIE, browserIdCookie, readBrowserId } from "@/lib/identity/browser-id"
import { sealFor, type CookieWrite } from "@/lib/connections/sealed-cookie"

const ORIGIN = "https://agentic-city.test"
const UID = "7".repeat(32)

function request(cookies: CookieWrite[]) {
  return new Request(ORIGIN, { headers: { cookie: cookies.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ") } })
}

describe("agents' wallet cookie", () => {
  const env = { ...process.env }
  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "wallet-cookie-secret"
  })
  afterEach(() => { process.env = { ...env } })

  it("creates a keypair whose secret is only in the sealed cookie", async () => {
    const wallet = await createAgentWallet(UID, { random: () => Buffer.alloc(32, 1), now: new Date("2026-10-02T00:00:00Z") })
    expect(wallet).toMatchObject({ uid: UID, createdAt: "2026-10-02T00:00:00.000Z" })
    expect(wallet.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    const cookie = agentWalletCookie(wallet)
    expect(cookie).toMatchObject({ name: AGENT_WALLET_COOKIE, maxAge: AGENT_WALLET_MAX_AGE })
    expect(cookie.value).not.toContain(Buffer.from(wallet.seed).toString("base64url"))
    expect(cookie.value).not.toContain(wallet.address)

    const read = readAgentWallet(request([cookie]))
    expect(read?.stale).toBe(false)
    expect(read?.record).toEqual(wallet)
    expect((await signerFor(read!.record)).address).toBe(wallet.address)
  })

  it("makes a different wallet for each browser", async () => {
    const a = await createAgentWallet(UID)
    const b = await createAgentWallet(UID)
    expect(a.address).not.toBe(b.address)
  })

  it("rejects forged, foreign-purpose and inconsistent cookies", async () => {
    const wallet = await createAgentWallet(UID)
    const sealed = (payload: unknown, purpose: "agent-wallet" | "browser-id" = "agent-wallet") => new Request(ORIGIN, { headers: { cookie: `${AGENT_WALLET_COOKIE}=${encodeURIComponent(sealFor(purpose, payload))}` } })
    const good = { v: 1, uid: UID, seed: Buffer.from(wallet.seed).toString("base64url"), address: wallet.address, createdAt: wallet.createdAt }
    expect(readAgentWallet(sealed(good))?.record.address).toBe(wallet.address)
    expect(readAgentWallet(sealed(good, "browser-id"))).toBeNull()
    expect(readAgentWallet(sealed({ ...good, v: 2 }))).toBeNull()
    expect(readAgentWallet(sealed({ ...good, uid: "nope" }))).toBeNull()
    expect(readAgentWallet(sealed({ ...good, address: "not-an-address" }))).toBeNull()
    expect(readAgentWallet(sealed({ ...good, seed: "c2hvcnQ" }))).toBeNull()
    expect(readAgentWallet(new Request(ORIGIN, { headers: { cookie: `${AGENT_WALLET_COOKIE}=garbage` } }))).toBeNull()
    expect(readAgentWallet(new Request(ORIGIN))).toBeNull()

    // A seed that does not match the sealed address never signs.
    const other = await createAgentWallet(UID)
    const mismatched = readAgentWallet(sealed({ ...good, address: other.address }))
    await expect(signerFor(mismatched!.record)).rejects.toThrow("does not match")
  })

  it("rotates: a cookie sealed with the previous secret is re-sealed on resolve", async () => {
    const wallet = await createAgentWallet(UID)
    const old = [browserIdCookie(UID), agentWalletCookie(wallet)]
    process.env.CONNECTIONS_SECRET = "rotated-secret"
    process.env.CONNECTIONS_SECRET_PREVIOUS = "wallet-cookie-secret"
    expect(readAgentWallet(request(old))?.stale).toBe(true)

    const resolved = await resolveAgentWallet(request(old), { create: true })
    expect(resolved?.wallet?.address).toBe(wallet.address)
    expect(resolved?.created).toBe(false)
    expect(resolved?.cookies.map((c) => c.name).sort()).toEqual([AGENT_WALLET_COOKIE, BROWSER_ID_COOKIE])
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    const reread = readAgentWallet(request(resolved!.cookies))
    expect(reread).toEqual({ record: wallet, stale: false })
  })
})

describe("resolveAgentWallet", () => {
  const env = { ...process.env }
  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "wallet-cookie-secret"
  })
  afterEach(() => { process.env = { ...env } })

  it("gives a first-time browser an id and a wallet", async () => {
    const resolved = await resolveAgentWallet(new Request(ORIGIN), { create: true })
    expect(resolved?.created).toBe(true)
    expect(resolved?.wallet?.uid).toBe(resolved?.uid)
    expect(resolved?.cookies.map((c) => c.name)).toEqual([BROWSER_ID_COOKIE, AGENT_WALLET_COOKIE])
    // The next request with those cookies is the same browser and the same wallet, with nothing to set.
    const again = await resolveAgentWallet(request(resolved!.cookies), { create: true })
    expect(again).toEqual({ uid: resolved!.uid, wallet: resolved!.wallet, cookies: [], created: false })
  })

  it("keeps an existing browser id when it creates the wallet", async () => {
    const resolved = await resolveAgentWallet(request([browserIdCookie(UID)]), { create: true })
    expect(resolved?.uid).toBe(UID)
    expect(resolved?.cookies.map((c) => c.name)).toEqual([AGENT_WALLET_COOKIE])
  })

  it("does not create a wallet unless asked", async () => {
    const resolved = await resolveAgentWallet(request([browserIdCookie(UID)]), { create: false })
    expect(resolved).toEqual({ uid: UID, wallet: null, cookies: [], created: false })
  })

  it("lets the wallet anchor the identity when the id cookie is missing or different", async () => {
    const wallet = await createAgentWallet(UID)
    const missing = await resolveAgentWallet(request([agentWalletCookie(wallet)]), { create: true })
    expect(missing?.uid).toBe(UID)
    expect(readBrowserId(request(missing!.cookies))?.id).toBe(UID)
    const different = await resolveAgentWallet(request([browserIdCookie("8".repeat(32)), agentWalletCookie(wallet)]), { create: true })
    expect(different?.uid).toBe(UID)
    expect(different?.cookies.map((c) => c.name)).toEqual([BROWSER_ID_COOKIE])
  })

  it("refreshes both cookies when asked (sliding one-year expiry)", async () => {
    const wallet = await createAgentWallet(UID)
    const resolved = await resolveAgentWallet(request([browserIdCookie(UID), agentWalletCookie(wallet)]), { create: true, refresh: true })
    expect(resolved?.cookies.map((c) => c.name)).toEqual([BROWSER_ID_COOKIE, AGENT_WALLET_COOKIE])
    const fresh = await resolveAgentWallet(new Request(ORIGIN), { create: false, refresh: true })
    expect(fresh?.cookies.map((c) => c.name)).toEqual([BROWSER_ID_COOKIE])
  })

  it("is unavailable without a sealing secret", async () => {
    delete process.env.BETTER_AUTH_SECRET
    expect(await resolveAgentWallet(new Request(ORIGIN), { create: true })).toBeNull()
  })
})
