import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decideApproval, getApproval } from "@/lib/mcp/approvals"
import { HIRES_PER_GRANT_PER_MINUTE } from "@/lib/mcp/config"
import { HOSTED_HEADER, newDataKey, verifyHostedTask } from "@/lib/mcp/crypto"
import { grantLedger, grantSigner, hireOverMcp, walletStatus, type McpHireDeps } from "@/lib/mcp/hire"
import { authenticateAccessToken, type AuthenticatedGrant } from "@/lib/mcp/oauth"
import { spentToday } from "@/lib/orchestration/budget"
import type { PaidFetch } from "@/lib/orchestration/wallet"
import { createMemoryStore, type KvStore } from "@/lib/security/kv-store"
import { fakeWalletRpc } from "@/__tests__/helpers/fake-wallet-rpc"
import { ORIGIN, UID, connectGrant } from "@/__tests__/helpers/mcp"

const TX = "5Xh1tTnL3qBGvzaZcvzPUVGuSkBH5YPbR1v4TRwMSiG1YpQ8GuRnrfV5K4vQ1gZb4E2xJ9qJXdT3Vd1fM8uEoW2"

function okFetch(answer = "La respuesta del agente") {
  return vi.fn<PaidFetch>(async () => new Response(JSON.stringify({ ok: true, result: answer, receipt: { transaction: TX, network: "solana:devnet", payer: "payer", amount: "10000", asset: "usdc" } }), { status: 200 }))
}

describe("hiring over MCP", () => {
  const env = { ...process.env }
  let store: KvStore
  let auth: AuthenticatedGrant
  let paidFetch: ReturnType<typeof okFetch>
  let deps: McpHireDeps

  async function setup(options: { capMicro?: number; balance?: bigint | null; perDayMicro?: number; hardDayMicro?: number; scope?: string } = {}) {
    store = createMemoryStore()
    const { tokens, wallet } = await connectGrant(store, { capMicro: options.capMicro ?? 20_000, scope: options.scope, team: [{ id: "researcher", name: "Investigadora", role: "Research" }, { id: "writer", name: "Redactor", role: "Write" }] })
    const result = await authenticateAccessToken(store, tokens.access_token, ORIGIN)
    if (!result.ok) throw new Error("auth failed")
    auth = result.value
    const { rpc } = await fakeWalletRpc({ balances: { [wallet.address]: options.balance === undefined ? BigInt(50_000) : options.balance } })
    paidFetch = okFetch()
    deps = {
      store,
      origin: ORIGIN,
      baseUrl: ORIGIN,
      caps: { perRunMicro: 30_000, perDayMicro: options.perDayMicro ?? 500_000, hardDayMicro: options.hardDayMicro ?? 2_000_000 },
      priceMicro: 10_000,
      rpc,
      paidFetchFor: () => paidFetch,
      hostedReady: true,
      ownerTag: "0123456789abcdef0123",
    }
    return wallet
  }

  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    process.env.BETTER_AUTH_SECRET = "mcp-hire-secret"
  })
  afterEach(() => {
    process.env = { ...env }
    vi.restoreAllMocks()
  })

  it("pays the agent's x402 task from the grant's wallet and returns the answer with the receipt", async () => {
    await setup()
    const outcome = await hireOverMcp(deps, auth, { agentId: "Investigadora", task: "  Resumí x402  " })
    expect(outcome).toMatchObject({ ok: true, agent: { id: "researcher" }, answer: "La respuesta del agente", receipt: { transaction: TX, explorerUrl: `https://explorer.solana.com/tx/${TX}?cluster=devnet` } })
    const [url, init] = paidFetch.mock.calls[0]
    expect(url).toBe(`${ORIGIN}/api/x402/agents/researcher/task`)
    const body = JSON.parse(String(init?.body))
    expect(body).toEqual({ task: "Resumí x402", agent: { name: "Investigadora", role: "Research", hosted: true } })
    const header = (init?.headers as Record<string, string>)[HOSTED_HEADER]
    expect(verifyHostedTask(header, { agentId: "researcher", task: "Resumí x402" })).toEqual({ ownerTag: "0123456789abcdef0123" })
    expect(await spentToday(store, grantLedger(auth.grant.id))).toBe(10_000)
    expect(await spentToday(store, UID)).toBe(10_000)
  })

  it("refuses before spending: no hire scope, no hosted model, bad task, unknown agent", async () => {
    await setup({ scope: "agents:read" })
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "x" })).toMatchObject({ ok: false, message: expect.stringContaining("agents:hire") })
    await setup()
    expect(await hireOverMcp({ ...deps, hostedReady: false }, auth, { agentId: "researcher", task: "x" })).toMatchObject({ ok: false, message: expect.stringContaining("not configured") })
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "   " })).toMatchObject({ ok: false })
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "x".repeat(2001) })).toMatchObject({ ok: false })
    expect(await hireOverMcp(deps, auth, { agentId: "nobody", task: "x" })).toMatchObject({ ok: false, message: expect.stringContaining("researcher, writer") })
    expect(paidFetch).not.toHaveBeenCalled()
  })

  it("over the client's cap: nothing paid, an approval link, and the approved hire runs once", async () => {
    await setup({ capMicro: 10_000 })
    expect((await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })).ok).toBe(true)
    const over = await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos" })
    expect(over.ok).toBe(false)
    if (over.ok) return
    expect(over.approveUrl).toBe(`${ORIGIN}/mcp/approve?id=${over.approvalId}`)
    expect(over.message).toContain("client's daily cap of 0.01 USDC")
    expect(paidFetch).toHaveBeenCalledTimes(1)
    expect(await spentToday(store, grantLedger(auth.grant.id))).toBe(10_000)

    const id = over.approvalId as string
    // Every attempt counts against the per-minute limit, so this test moves the clock along.
    let clock = Date.now()
    deps.now = () => new Date((clock += 30_000))
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos", approvalId: id })).toMatchObject({ ok: false, message: expect.stringContaining("has not approved") })
    expect(await decideApproval(store, id, "c".repeat(32), "approve")).toMatchObject({ ok: false })
    expect(await decideApproval(store, id, UID, "approve")).toMatchObject({ ok: true })
    expect(await decideApproval(store, id, UID, "approve")).toMatchObject({ ok: false })
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "otra", approvalId: id })).toMatchObject({ ok: false, message: expect.stringContaining("different agent or task") })
    expect((await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos", approvalId: id })).ok).toBe(true)
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos", approvalId: id })).toMatchObject({ ok: false, message: expect.stringContaining("already used") })
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos", approvalId: "f".repeat(32) })).toMatchObject({ ok: false, message: expect.stringContaining("does not exist") })
    expect(paidFetch).toHaveBeenCalledTimes(2)
  })

  it("a rejected approval is final", async () => {
    await setup({ capMicro: 10_000 })
    await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })
    const over = await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos" })
    const id = over.ok ? "" : over.approvalId as string
    await decideApproval(store, id, UID, "reject")
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos", approvalId: id })).toMatchObject({ ok: false, message: expect.stringContaining("rejected") })
    expect((await getApproval(store, id))?.status).toBe("rejected")
  })

  it("over the browser's shared cap: releases the client's reservation and asks for approval", async () => {
    await setup({ perDayMicro: 10_000 })
    expect((await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })).ok).toBe(true)
    const over = await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos" })
    expect(over).toMatchObject({ ok: false, message: expect.stringContaining("shared with the chat") })
    expect(await spentToday(store, grantLedger(auth.grant.id))).toBe(10_000)
  })

  it("even an approved hire stops at the hard daily ceiling", async () => {
    await setup({ capMicro: 10_000, hardDayMicro: 10_000 })
    await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })
    const over = await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos" })
    const id = over.ok ? "" : over.approvalId as string
    await decideApproval(store, id, UID, "approve")
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos", approvalId: id })).toMatchObject({ ok: false, message: expect.stringContaining("hard daily limit") })
    expect(paidFetch).toHaveBeenCalledTimes(1)
  })

  it("an empty wallet gets the funding link and nothing is reserved", async () => {
    await setup({ balance: BigInt(5_000) })
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })).toMatchObject({ ok: false, message: expect.stringContaining(`${ORIGIN}/mcp`) })
    expect(paidFetch).not.toHaveBeenCalled()
    expect(await spentToday(store, grantLedger(auth.grant.id))).toBe(0)
    expect(await spentToday(store, UID)).toBe(0)
  })

  it("a balance that cannot be read does not block the hire", async () => {
    await setup()
    deps.rpc = (await fakeWalletRpc({ failRead: new Error("rpc down") })).rpc
    expect((await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })).ok).toBe(true)
  })

  it("a failed payment releases the reservations; a paid failure keeps them and returns the receipt", async () => {
    await setup()
    paidFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "facilitator down" }), { status: 402 }))
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })).toMatchObject({ ok: false, message: expect.stringContaining("Nothing was charged") })
    expect(await spentToday(store, UID)).toBe(0)

    paidFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "model failed", receipt: { transaction: TX } }), { status: 502 }))
    const paid = await hireOverMcp(deps, auth, { agentId: "researcher", task: "dos" })
    expect(paid).toMatchObject({ ok: false, receipt: { transaction: TX }, message: expect.stringContaining("could not finish") })
    expect(await spentToday(store, UID)).toBe(10_000)
  })

  it("limits hires per minute", async () => {
    await setup({ capMicro: 1_000_000 })
    for (let i = 0; i < HIRES_PER_GRANT_PER_MINUTE; i++) expect((await hireOverMcp(deps, auth, { agentId: "writer", task: `t${i}` })).ok).toBe(true)
    expect(await hireOverMcp(deps, auth, { agentId: "writer", task: "one more" })).toMatchObject({ ok: false, message: expect.stringContaining("Too many hires") })
  })

  it("fails closed when the ledger is unavailable", async () => {
    await setup()
    deps.store = { ...store, incr: vi.fn().mockRejectedValue(new Error("KV down")) }
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })).toMatchObject({ ok: false, message: expect.stringContaining("ledger") })
    expect(paidFetch).not.toHaveBeenCalled()
  })

  it("refuses when the grant's wallet cannot be opened", async () => {
    await setup()
    const broken: AuthenticatedGrant = { ...auth, dataKey: newDataKey() }
    expect(await grantSigner(broken)).toBeNull()
    expect(await hireOverMcp(deps, broken, { agentId: "researcher", task: "uno" })).toMatchObject({ ok: false, message: expect.stringContaining("could not be opened") })
    expect(await spentToday(store, UID)).toBe(0)
  })

  it("refuses when the server cannot sign hosted tasks", async () => {
    await setup()
    delete process.env.BETTER_AUTH_SECRET
    expect(await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })).toMatchObject({ ok: false, message: expect.stringContaining("not configured") })
    expect(await spentToday(store, UID)).toBe(0)
  })

  it("reports the wallet status with both ledgers and caps", async () => {
    const wallet = await setup()
    await hireOverMcp(deps, auth, { agentId: "researcher", task: "uno" })
    expect(await walletStatus(deps, auth)).toEqual({
      address: wallet.address,
      balanceUsdc: "0.05",
      priceUsdc: "0.01",
      spentToday: { thisClientUsdc: "0.01", agentsWalletUsdc: "0.01" },
      caps: { thisClientPerDayUsdc: "0.02", agentsWalletPerDayUsdc: "0.5", hardPerDayUsdc: "2" },
      fundUrl: `${ORIGIN}/mcp`,
      explorerUrl: `https://explorer.solana.com/address/${wallet.address}?cluster=devnet`,
    })
    deps.rpc = (await fakeWalletRpc({ failRead: new Error("rpc down") })).rpc
    expect((await walletStatus(deps, auth)).balanceUsdc).toBeNull()
  })
})
