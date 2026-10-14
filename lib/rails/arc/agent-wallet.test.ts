import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { agentWalletCookie, createAgentWallet, readAgentWallet } from "@/lib/agent-wallet/cookie"
import { sealFor, type CookieWrite } from "@/lib/connections/sealed-cookie"
import { BROWSER_ID_COOKIE, browserIdCookie } from "@/lib/identity/browser-id"
import {
  ARC_AGENT_WALLET_COOKIE,
  ARC_AGENT_WALLET_MAX_AGE,
  arcAccountFor,
  arcAgentWalletCookie,
  createArcAgentWallet,
  readArcAgentWallet,
  resolveArcAgentWallet,
} from "@/lib/rails/arc/agent-wallet"

const ORIGIN = "https://agentic-city.test"
const UID = "7".repeat(32)
const OTHER_UID = "8".repeat(32)

function request(cookies: CookieWrite[]) {
  return new Request(ORIGIN, { headers: { cookie: cookies.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ") } })
}

describe("Arc agents' wallet cookie", () => {
  const env = { ...process.env }
  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "arc-wallet-cookie-secret"
  })
  afterEach(() => { process.env = { ...env } })

  it("creates an EVM key whose secret is only in its own sealed cookie", () => {
    const wallet = createArcAgentWallet(UID, { random: () => Buffer.alloc(32, 7), now: new Date("2026-10-14T00:00:00Z") })
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(wallet.createdAt).toBe("2026-10-14T00:00:00.000Z")
    const cookie = arcAgentWalletCookie(wallet)
    expect(cookie).toMatchObject({ name: ARC_AGENT_WALLET_COOKIE, maxAge: ARC_AGENT_WALLET_MAX_AGE })
    expect(cookie.value).not.toContain(wallet.key.slice(2))
    expect(cookie.value).not.toContain(wallet.address)

    const read = readArcAgentWallet(request([cookie]))
    expect(read).toEqual({ record: wallet, stale: false })
    expect(arcAccountFor(read!.record).address).toBe(wallet.address)
  })

  it("is isolated from the Solana wallet cookie both ways", async () => {
    const arc = createArcAgentWallet(UID)
    const solana = await createAgentWallet(UID)
    // Same value under the other cookie name: the other purpose's key cannot open it.
    expect(readAgentWallet(request([{ ...arcAgentWalletCookie(arc), name: "ac_agent_wallet" }]))).toBeNull()
    expect(readArcAgentWallet(request([{ ...agentWalletCookie(solana), name: ARC_AGENT_WALLET_COOKIE }]))).toBeNull()
    // Both can live side by side.
    const both = request([arcAgentWalletCookie(arc), agentWalletCookie(solana)])
    expect(readArcAgentWallet(both)?.record.address).toBe(arc.address)
    expect(readAgentWallet(both)?.record.address).toBe(solana.address)
  })

  it("never derives the Arc key from the Solana seed", async () => {
    const solana = await createAgentWallet(UID, { random: () => Buffer.alloc(32, 3) })
    const arc = createArcAgentWallet(UID)
    expect(arc.key.slice(2)).not.toBe(Buffer.from(solana.seed).toString("hex"))
  })

  it("rejects a sealed value of the wrong version, chain or shape", () => {
    const wallet = createArcAgentWallet(UID)
    const forged = (payload: unknown) => request([{ name: ARC_AGENT_WALLET_COOKIE, value: sealFor("agent-wallet:arc", payload), maxAge: 60 }])
    const good = { v: 2, chain: "arc", uid: UID, key: wallet.key, address: wallet.address, createdAt: wallet.createdAt }
    expect(readArcAgentWallet(forged(good))?.record.address).toBe(wallet.address)
    expect(readArcAgentWallet(forged({ ...good, v: 1 }))).toBeNull()
    expect(readArcAgentWallet(forged({ ...good, chain: "solana" }))).toBeNull()
    expect(readArcAgentWallet(forged({ ...good, key: "0x1234" }))).toBeNull()
    expect(readArcAgentWallet(forged({ ...good, uid: "nope" }))).toBeNull()
    // A key that does not match the sealed address is refused when used.
    const other = createArcAgentWallet(UID)
    const mismatched = readArcAgentWallet(forged({ ...good, address: other.address }))
    expect(() => arcAccountFor(mismatched!.record)).toThrow(/does not match/)
  })

  it("joins the browser id of the Solana wallet, and keeps its own id once created", async () => {
    const solana = await createAgentWallet(OTHER_UID)
    const resolved = resolveArcAgentWallet(request([agentWalletCookie(solana), browserIdCookie(UID)]), { create: true })
    expect(resolved?.uid).toBe(OTHER_UID)
    expect(resolved?.created).toBe(true)
    const arcCookie = resolved!.cookies.find((cookie) => cookie.name === ARC_AGENT_WALLET_COOKIE)!
    const again = resolveArcAgentWallet(request([arcCookie, browserIdCookie(UID)]), { create: true })
    expect(again).toMatchObject({ uid: OTHER_UID, created: false })
    expect(again?.wallet?.address).toBe(resolved?.wallet?.address)
  })

  it("does not create a wallet without `create`, and returns null without a sealing secret", () => {
    const without = resolveArcAgentWallet(request([]), { create: false })
    expect(without?.wallet).toBeNull()
    expect(without?.cookies.some((cookie) => cookie.name === BROWSER_ID_COOKIE)).toBe(true)
    delete process.env.BETTER_AUTH_SECRET
    expect(resolveArcAgentWallet(request([]), { create: true })).toBeNull()
  })
})
