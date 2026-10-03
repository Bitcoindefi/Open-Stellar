import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generateKeyPairSync } from "node:crypto"
import { createKeyPairSignerFromBytes, createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit"
import type { WalletRpc } from "@/lib/agent-wallet/chain"

const rpcState = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/lib/agent-wallet/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-wallet/chain")>()),
  createWalletRpc: () => rpcState.current,
}))

import { GET } from "@/app/api/agent-wallet/route"
import { POST as withdraw } from "@/app/api/agent-wallet/withdraw/route"
import { POST as fundRoute } from "@/app/api/agent-wallet/fund/route"
import { FUND_AMOUNT_MICRO, fundTransactionProblem } from "@/lib/agent-wallet/fund-tx"
import { AGENT_WALLET_COOKIE, agentWalletCookie, createAgentWallet } from "@/lib/agent-wallet/cookie"
import { WALLET_LIMITS } from "@/lib/agent-wallet/limits"
import { BROWSER_ID_COOKIE, browserIdCookie } from "@/lib/identity/browser-id"
import { isPublicApiRoute } from "@/lib/auth/middleware"
import { createMemoryStore, setKvStoreForTests, type KvStore } from "@/lib/security/kv-store"
import { fakeWalletRpc } from "@/__tests__/helpers/fake-wallet-rpc"

const ORIGIN = "https://agentic-city.test"
const UID = "9".repeat(32)

function serverSecret(): string {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const d = Buffer.from(privateKey.export({ format: "jwk" }).d as string, "base64url")
  const x = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url")
  return JSON.stringify(Array.from(Buffer.concat([d, x])))
}

function cookieHeader(cookies: Array<{ name: string; value: string }>) {
  return cookies.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ")
}

/** Cookies as a browser would send them back, from Set-Cookie headers. */
function jar(res: Response): string {
  return res.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ")
}

function get(headers: Record<string, string> = {}) {
  return GET(new Request(`${ORIGIN}/api/agent-wallet`, { headers }))
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return withdraw(new Request(`${ORIGIN}/api/agent-wallet/withdraw`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(body) }))
}

function fund(body: unknown, headers: Record<string, string> = {}) {
  return fundRoute(new Request(`${ORIGIN}/api/agent-wallet/fund`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(body) }))
}

describe("agents' wallet routes", () => {
  const env = { ...process.env }
  beforeEach(async () => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "wallet-routes-secret"
    process.env.SOLANA_SERVER_SECRET = serverSecret()
    setKvStoreForTests(createMemoryStore())
    rpcState.current = (await fakeWalletRpc()).rpc
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    process.env = { ...env }
    setKvStoreForTests(null)
    vi.restoreAllMocks()
  })

  it("are reachable without an API key or a login", () => {
    expect(isPublicApiRoute("/api/agent-wallet", "GET")).toBe(true)
    expect(isPublicApiRoute("/api/agent-wallet/withdraw", "POST")).toBe(true)
    expect(isPublicApiRoute("/api/agent-wallet/fund", "POST")).toBe(true)
    expect(isPublicApiRoute("/api/agent-wallet", "POST")).toBe(false)
  })

  it("GET creates this browser's wallet on first visit and returns only public data", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({
      ok: true,
      created: true,
      network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      balanceMicro: "0",
      balanceUsdc: "0",
      fundUsdc: "0.1",
      hirePriceUsdc: "0.01",
      caps: { perRunUsdc: "0.03", perDayUsdc: "0.5" },
      spentTodayUsdc: "0",
      withdrawAvailable: true,
    })
    expect(data.feePayer).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    expect(data.explorerUrl).toBe(`https://explorer.solana.com/address/${data.address}?cluster=devnet`)
    const names = res.headers.getSetCookie().map((line) => line.split("=")[0])
    expect(names).toEqual([BROWSER_ID_COOKIE, AGENT_WALLET_COOKIE])
    expect(JSON.stringify(data)).not.toMatch(/seed|secret/i)

    // The same browser comes back to the same wallet, with its balance.
    rpcState.current = (await fakeWalletRpc({ balances: { [data.address]: BigInt(100000) } })).rpc
    const again = await (await get({ cookie: jar(res) })).json()
    expect(again).toMatchObject({ address: data.address, created: false, balanceUsdc: "0.1" })
  })

  it("GET refuses cross-site reads, and needs a sealing secret", async () => {
    expect((await get({ origin: "https://evil.test" })).status).toBe(403)
    expect((await get({ "sec-fetch-site": "cross-site" })).status).toBe(403)
    delete process.env.BETTER_AUTH_SECRET
    expect((await get()).status).toBe(503)
  })

  it("GET still answers when the RPC is down or the browser reads too often", async () => {
    rpcState.current = (await fakeWalletRpc({ failRead: new Error("rpc down") })).rpc
    const first = await get()
    expect(await first.json()).toMatchObject({ ok: true, balanceUsdc: null, rateLimited: false })
    const cookie = jar(first)
    for (let i = 1; i < WALLET_LIMITS.balancePerBrowserPerMinute; i++) await get({ cookie })
    expect(await (await get({ cookie })).json()).toMatchObject({ ok: true, balanceUsdc: null, rateLimited: true })
    delete process.env.SOLANA_SERVER_SECRET
    expect(await (await get({ cookie })).json()).toMatchObject({ withdrawAvailable: false, feePayer: null })
  })

  it("withdraw sends everything back to the connected wallet, fee paid by the server", async () => {
    const wallet = await createAgentWallet(UID)
    const person = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(21))).address
    const fake = await fakeWalletRpc({ balances: { [wallet.address]: BigInt(90000), [person]: BigInt(0) } })
    rpcState.current = fake.rpc
    const cookie = cookieHeader([browserIdCookie(UID), agentWalletCookie(wallet)])
    const res = await post({ to: person }, { cookie })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toMatchObject({ ok: true, confirmed: true, amountUsdc: "0.09" })
    expect(data.explorerUrl).toContain(data.signature)
    expect(fake.sent).toHaveLength(1)
    const server = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(process.env.SOLANA_SERVER_SECRET!) as number[]))
    const { getTransactionDecoder, getCompiledTransactionMessageDecoder } = await import("@solana/kit")
    const message = getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(Buffer.from(fake.sent[0], "base64")).messageBytes)
    expect(message.staticAccounts[0]).toBe(server.address)
  })

  it("withdraw checks origin, the wallet cookie, the destination and the server config", async () => {
    const wallet = await createAgentWallet(UID)
    const cookie = cookieHeader([agentWalletCookie(wallet)])
    const person = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(22))).address
    expect((await post({ to: person }, { cookie, origin: "https://evil.test" })).status).toBe(403)
    expect((await withdraw(new Request(`${ORIGIN}/api/agent-wallet/withdraw`, { method: "POST", headers: { cookie }, body: "{}" }))).status).toBe(403)
    expect((await post({ to: person })).status).toBe(404)
    expect((await post({ to: "not-an-address" }, { cookie })).status).toBe(400)
    expect((await post(null, { cookie })).status).toBe(400)
    // An empty agents' wallet has nothing to withdraw: refused, nothing sent.
    expect((await post({ to: person }, { cookie })).status).toBe(409)
    delete process.env.SOLANA_SERVER_SECRET
    expect((await post({ to: person }, { cookie })).status).toBe(503)
  })

  it("withdraw is rate limited per browser and fails closed when the store is down", async () => {
    const wallet = await createAgentWallet(UID)
    const cookie = cookieHeader([agentWalletCookie(wallet)])
    const person = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(23))).address
    for (let i = 0; i < WALLET_LIMITS.withdrawPerBrowserPerHour; i++) await post({ to: person }, { cookie })
    expect((await post({ to: person }, { cookie })).status).toBe(429)
    const broken: KvStore = { ...createMemoryStore(), incr: async () => { throw new Error("KV down") } }
    setKvStoreForTests(broken)
    expect((await post({ to: person }, { cookie })).status).toBe(503)
  })

  it("fund prepares a sponsored transaction the person only has to sign", async () => {
    const wallet = await createAgentWallet(UID)
    const cookie = cookieHeader([agentWalletCookie(wallet)])
    const person = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(25))).address
    const res = await fund({ payer: person }, { cookie })
    expect(res.status).toBe(200)
    const data = await res.json()
    const server = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(process.env.SOLANA_SERVER_SECRET!) as number[]))
    expect(data).toMatchObject({ ok: true, feePayer: server.address, amountUsdc: "0.1" })
    const bytes = new Uint8Array(Buffer.from(data.transaction, "base64"))
    expect(await fundTransactionProblem(bytes, { payer: person, agentWallet: wallet.address, feePayer: server.address, maxAmountMicro: FUND_AMOUNT_MICRO })).toBeNull()
  })

  it("fund checks origin, cookie, payer, sponsor config, limits and RPC failures", async () => {
    const wallet = await createAgentWallet(UID)
    const cookie = cookieHeader([agentWalletCookie(wallet)])
    const person = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(26))).address
    expect((await fund({ payer: person }, { cookie, origin: "https://evil.test" })).status).toBe(403)
    expect((await fund({ payer: person })).status).toBe(404)
    expect((await fund({ payer: "nope" }, { cookie })).status).toBe(400)
    expect((await fund({ payer: wallet.address }, { cookie })).status).toBe(400)
    expect((await fund(null, { cookie })).status).toBe(400)
    for (const amountUsdc of ["0.001", "11", "lots", { x: 1 }]) expect((await fund({ payer: person, amountUsdc }, { cookie })).status).toBe(400)
    const custom = await (await fund({ payer: person, amountUsdc: "0.05" }, { cookie })).json()
    expect(custom).toMatchObject({ ok: true, amountUsdc: "0.05" })

    for (let i = 0; i < WALLET_LIMITS.fundPerBrowserPerHour; i++) await fund({ payer: person }, { cookie })
    expect((await fund({ payer: person }, { cookie })).status).toBe(429)

    setKvStoreForTests({ ...createMemoryStore(), incr: async () => { throw new Error("KV down") } })
    expect((await fund({ payer: person }, { cookie })).status).toBe(503)
    setKvStoreForTests(createMemoryStore())
    rpcState.current = { getLatestBlockhash: () => ({ send: async () => { throw new Error("rpc down") } }) }
    expect((await fund({ payer: person }, { cookie })).status).toBe(502)
    delete process.env.SOLANA_SERVER_SECRET
    expect((await fund({ payer: person }, { cookie })).status).toBe(503)
  })

  it("withdraw explains a server without SOL and hides other errors", async () => {
    const wallet = await createAgentWallet(UID)
    const cookie = cookieHeader([agentWalletCookie(wallet)])
    const person = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(24))).address
    const balances = { [wallet.address]: BigInt(10), [person]: BigInt(0) }
    rpcState.current = (await fakeWalletRpc({ balances, failSend: new Error("Attempt to debit an account but found no record of a prior credit. insufficient lamports") })).rpc
    const broke = await post({ to: person }, { cookie })
    expect(broke.status).toBe(503)
    expect((await broke.json()).error).toContain("no devnet SOL")
    rpcState.current = (await fakeWalletRpc({ balances, failSend: new Error("internal node detail 10.0.0.3") })).rpc
    const hidden = await post({ to: person }, { cookie })
    expect(hidden.status).toBe(502)
    expect((await hidden.json()).error).not.toContain("10.0.0.3")
    rpcState.current = { ...(rpcState.current as WalletRpc) }
  })
})
