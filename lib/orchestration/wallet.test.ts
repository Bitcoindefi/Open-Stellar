import { describe, expect, it, vi } from "vitest"
import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit"
import { encodePaymentResponseHeader } from "@x402/core/http"
import { SOLANA_DEVNET_CAIP2, USDC_DEVNET_ADDRESS } from "@x402/svm"
import {
  createOrchestratorFetch,
  devnetUsdcPolicy,
  payAgentTask,
  type HireAgent,
} from "@/lib/orchestration/wallet"

const agent: HireAgent = { id: "research", name: "Investigador", role: "Relevar opciones", connection: { provider: "openrouter", model: "m", apiKey: "or-test-key-1234" } }
const receipt = { transaction: "5igSig", network: SOLANA_DEVNET_CAIP2, payer: "Payer", amount: "10000", asset: USDC_DEVNET_ADDRESS }

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}

describe("createOrchestratorFetch", () => {
  it("builds a paying fetch for an agents' wallet signer", async () => {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(9))
    const paid = createOrchestratorFetch(signer, { maxAtomic: BigInt(10_000), rpcUrl: "https://api.devnet.solana.com", fetchImpl: vi.fn(async () => jsonResponse({ ok: true })) })
    expect(typeof paid).toBe("function")
    expect((await paid("https://example.test")).status).toBe(200)
  })
})

describe("devnetUsdcPolicy", () => {
  const base = { scheme: "exact", network: SOLANA_DEVNET_CAIP2, asset: USDC_DEVNET_ADDRESS, amount: "10000", payTo: "x", maxTimeoutSeconds: 60, extra: {} }

  it("pays devnet USDC up to the cap and nothing else", () => {
    const policy = devnetUsdcPolicy(BigInt(10_000))
    const offers = [
      base,
      { ...base, amount: "10001" },
      { ...base, network: "solana:mainnet" },
      { ...base, asset: "OtherMint" },
      { ...base, amount: "not-a-number" },
    ]
    expect(policy(2, offers as never)).toEqual([base])
  })
})

describe("payAgentTask", () => {
  it("posts the task to the agent's x402 endpoint and returns the answer with the receipt", async () => {
    const paid = vi.fn(async () => jsonResponse({ ok: true, result: "Tres opciones", receipt }))
    const result = await payAgentTask({ baseUrl: "https://agentic-city.test/", agent, task: "Find options" }, paid)

    expect(result).toEqual({ ok: true, answer: "Tres opciones", receipt: { ...receipt, explorerUrl: "https://explorer.solana.com/tx/5igSig?cluster=devnet" } })
    const [url, init] = paid.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://agentic-city.test/api/x402/agents/research/task")
    expect(JSON.parse(init.body as string)).toEqual({ task: "Find options", agent: { name: "Investigador", role: "Relevar opciones", connection: agent.connection } })
  })

  it("keeps the receipt when the agent failed after the payment settled", async () => {
    const paid = vi.fn(async () => jsonResponse({ ok: false, error: "OpenRouter rejected the request (HTTP 401).", receipt }, 502))
    const result = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, paid)
    expect(result).toMatchObject({ ok: false, error: "OpenRouter rejected the request (HTTP 401).", receipt: { transaction: "5igSig" } })
  })

  it("reads the receipt from PAYMENT-RESPONSE when the body has none", async () => {
    const header = encodePaymentResponseHeader({ success: true, transaction: "HeaderSig", network: SOLANA_DEVNET_CAIP2, payer: "P" })
    const paid = vi.fn(async () => jsonResponse({ ok: true, result: "ok" }, 200, { "PAYMENT-RESPONSE": header }))
    const result = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, paid)
    expect(result).toMatchObject({ ok: true, receipt: { transaction: "HeaderSig", payer: "P" } })
  })

  it("ignores a malformed or failed PAYMENT-RESPONSE header", async () => {
    const failed = encodePaymentResponseHeader({ success: false, transaction: "", network: SOLANA_DEVNET_CAIP2, errorReason: "x" } as never)
    for (const header of ["%%%", failed]) {
      const result = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, vi.fn(async () => jsonResponse({ ok: true, result: "ok" }, 200, { "PAYMENT-RESPONSE": header })))
      expect(result).toEqual({ ok: false, error: "the agent's endpoint answered HTTP 200" })
    }
  })

  it("reports a payment that was not accepted, without a receipt", async () => {
    const result = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, vi.fn(async () => jsonResponse({}, 402)))
    expect(result).toEqual({ ok: false, error: "the agent's endpoint did not accept the payment" })
    const withMessage = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, vi.fn(async () => jsonResponse({ error: "Payments are not configured on this server." }, 503)))
    expect(withMessage).toEqual({ ok: false, error: "Payments are not configured on this server." })
  })

  it("never throws when the payment itself fails", async () => {
    const result = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, vi.fn(async () => { throw new Error("No matching payment requirements") }))
    expect(result).toEqual({ ok: false, error: "the payment could not be made (No matching payment requirements)" })
    const odd = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, vi.fn(async () => { throw "boom" }))
    expect(odd).toEqual({ ok: false, error: "the payment could not be made (network error)" })
  })

  it("fills defaults for a sparse receipt and rejects a receipt without a transaction", async () => {
    const sparse = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, vi.fn(async () => jsonResponse({ ok: true, result: "r", receipt: { transaction: "Sig" } })))
    expect(sparse).toMatchObject({ ok: true, receipt: { transaction: "Sig", network: SOLANA_DEVNET_CAIP2, payer: null, amount: "", asset: USDC_DEVNET_ADDRESS } })
    const none = await payAgentTask({ baseUrl: "https://a.test", agent, task: "t" }, vi.fn(async () => jsonResponse({ ok: true, result: "r", receipt: { transaction: "" } })))
    expect(none.ok).toBe(false)
  })
})
