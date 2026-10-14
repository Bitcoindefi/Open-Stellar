import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ARC_TESTNET_CAIP2 } from "@/lib/rails/arc/constants"
import type { ArcChain } from "@/lib/rails/arc/chain"
import { arcWalletStatus, arcWithdraw, setArcChainForTests } from "@/lib/rails/arc/wallet-api"
import { createMemoryStore, setKvStoreForTests, type KvStore } from "@/lib/security/kv-store"

const ORIGIN = "https://agentic-city.test"
const HASH = `0x${"cd".repeat(32)}` as `0x${string}`
const destination = privateKeyToAccount(generatePrivateKey()).address

function fakeChain(balance: bigint | Error, transfer: `0x${string}` | Error = HASH): ArcChain {
  return {
    usdcBalance: async () => {
      if (balance instanceof Error) throw balance
      return balance
    },
    transferUsdc: async () => {
      if (transfer instanceof Error) throw transfer
      return transfer
    },
    waitForReceipt: async () => null,
  }
}

/** Opens a wallet and returns the cookie header that carries it. */
async function openWallet(): Promise<{ cookie: string; body: Record<string, unknown> }> {
  const response = await arcWalletStatus(new Request(`${ORIGIN}/api/agent-wallet?network=arc`))
  const cookie = response.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ")
  return { cookie, body: await response.json() as Record<string, unknown> }
}

function withdrawRequest(cookie: string, to: unknown = destination) {
  return new Request(`${ORIGIN}/api/agent-wallet/withdraw?network=arc`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ to }) })
}

describe("Arc agents' wallet API", () => {
  const env = { ...process.env }
  let store: KvStore

  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "arc-wallet-api-secret"
    store = createMemoryStore()
    setKvStoreForTests(store)
  })
  afterEach(() => {
    process.env = { ...env }
    setKvStoreForTests(null)
    setArcChainForTests(null)
  })

  it("creates the wallet on first look and reports its ERC-20 USDC balance", async () => {
    setArcChainForTests(() => fakeChain(BigInt(120_000)))
    const { cookie, body } = await openWallet()
    expect(cookie).toContain("ac_agent_wallet_arc=")
    expect(body).toMatchObject({ ok: true, network: ARC_TESTNET_CAIP2, created: true, balanceMicro: "120000", balanceUsdc: "0.12", gasReserveUsdc: "0.01", withdrawAvailable: true })
    expect(String(body.address)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(JSON.stringify(body)).not.toMatch(/key/i)
  })

  it("still answers when the balance cannot be read", async () => {
    setArcChainForTests(() => fakeChain(new Error("rpc down")))
    const { body } = await openWallet()
    expect(body).toMatchObject({ ok: true, balanceMicro: null, balanceUsdc: null })
  })

  it("answers 503 when wallets are not configured", async () => {
    delete process.env.BETTER_AUTH_SECRET
    const response = await arcWalletStatus(new Request(`${ORIGIN}/api/agent-wallet?network=arc`))
    expect(response.status).toBe(503)
  })

  it("withdraws everything above the gas reserve", async () => {
    setArcChainForTests(() => fakeChain(BigInt(90_000)))
    const { cookie } = await openWallet()
    const response = await arcWithdraw(withdrawRequest(cookie))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, signature: HASH, amountUsdc: "0.08", confirmed: false })
  })

  it("refuses a withdrawal with nothing above the reserve, a bad destination, or no wallet", async () => {
    setArcChainForTests(() => fakeChain(BigInt(10_000)))
    const { cookie } = await openWallet()
    const empty = await arcWithdraw(withdrawRequest(cookie))
    expect(empty.status).toBe(409)
    expect(await empty.json()).toMatchObject({ error: expect.stringContaining("no USDC to withdraw") })
    expect((await arcWithdraw(withdrawRequest(cookie, "nope"))).status).toBe(400)
    expect((await arcWithdraw(withdrawRequest(""))).status).toBe(404)
  })

  it("maps transfer errors: gas shortfall to 409, anything else to 502", async () => {
    setArcChainForTests(() => fakeChain(BigInt(90_000), new Error("insufficient funds for gas")))
    const { cookie } = await openWallet()
    expect((await arcWithdraw(withdrawRequest(cookie))).status).toBe(409)
    setArcChainForTests(() => fakeChain(BigInt(90_000), new Error("nonce too low")))
    expect((await arcWithdraw(withdrawRequest(cookie))).status).toBe(502)
  })

  it("rate limits withdrawals and fails closed when the store is down", async () => {
    setArcChainForTests(() => fakeChain(BigInt(10_000)))
    const { cookie } = await openWallet()
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) statuses.push((await arcWithdraw(withdrawRequest(cookie))).status)
    expect(statuses).toContain(429)

    setKvStoreForTests({ ...createMemoryStore(), incr: async () => { throw new Error("down") } })
    expect((await arcWithdraw(withdrawRequest(cookie))).status).toBe(503)
  })
})
