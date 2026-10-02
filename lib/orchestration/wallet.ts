import type { KeyPairSigner } from "@solana/kit"
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client, type PaymentPolicy } from "@x402/fetch"
import { SOLANA_DEVNET_CAIP2, USDC_DEVNET_ADDRESS } from "@x402/svm"
import { ExactSvmScheme } from "@x402/svm/exact/client"
import type { ByokModelConnection } from "@/lib/ai/byok-provider"
import { explorerTxUrl } from "@/lib/solana/x402"

// Paying for a hire: when one agent hires another, the browser's own agents' wallet (see
// lib/agent-wallet/cookie.ts) pays the target agent's paid task endpoint
// (/api/x402/agents/<id>/task) with a standard x402 payment, signed here on the server during
// the chat run and settled by the facilitator, which also pays the network fee.

export type HopReceipt = {
  transaction: string
  network: string
  payer: string | null
  amount: string
  asset: string
  explorerUrl: string
}

export type HireAgent = { id: string; name: string; role: string; connection: ByokModelConnection }

export type HopResult =
  | { ok: true; answer: string; receipt: HopReceipt }
  /** `unfunded`: the agents' wallet holds less than the price, so nothing was attempted. */
  | { ok: false; error: string; receipt?: HopReceipt; code?: "unfunded"; balanceMicro?: number }

export type PaidFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Only pays devnet USDC, and never more than `maxAtomic` per request. A server that asks for
 * another network, another token or a bigger amount gets nothing.
 */
export function devnetUsdcPolicy(maxAtomic: bigint): PaymentPolicy {
  return (_version, requirements) => requirements.filter((item) => {
    if (item.network !== SOLANA_DEVNET_CAIP2 || item.asset !== USDC_DEVNET_ADDRESS) return false
    try {
      return BigInt(item.amount) <= maxAtomic
    } catch {
      return false
    }
  })
}

export function createOrchestratorFetch(signer: KeyPairSigner, options: { maxAtomic: bigint; rpcUrl?: string; fetchImpl?: typeof fetch }): PaidFetch {
  const client = new x402Client()
    .register(SOLANA_DEVNET_CAIP2, new ExactSvmScheme(signer, options.rpcUrl ? { rpcUrl: options.rpcUrl } : undefined))
    .registerPolicy(devnetUsdcPolicy(options.maxAtomic))
  return wrapFetchWithPayment(options.fetchImpl ?? fetch, client)
}

function receiptFromBody(value: unknown): HopReceipt | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.transaction !== "string" || !record.transaction) return null
  return {
    transaction: record.transaction,
    network: typeof record.network === "string" ? record.network : SOLANA_DEVNET_CAIP2,
    payer: typeof record.payer === "string" ? record.payer : null,
    amount: typeof record.amount === "string" ? record.amount : "",
    asset: typeof record.asset === "string" ? record.asset : USDC_DEVNET_ADDRESS,
    explorerUrl: explorerTxUrl(record.transaction),
  }
}

function receiptFromHeader(response: Response): HopReceipt | null {
  const header = response.headers.get("payment-response")
  if (!header) return null
  try {
    const settle = decodePaymentResponseHeader(header)
    if (!settle.success || !settle.transaction) return null
    return {
      transaction: settle.transaction,
      network: settle.network,
      payer: settle.payer ?? null,
      amount: "",
      asset: USDC_DEVNET_ADDRESS,
      explorerUrl: explorerTxUrl(settle.transaction),
    }
  } catch {
    return null
  }
}

/**
 * Hires one agent through its x402 task endpoint and returns its answer with the payment receipt.
 * Never throws: every failure comes back as a sentence, with the receipt when money did move.
 */
export async function payAgentTask(
  input: { baseUrl: string; agent: HireAgent; task: string; timeoutMs?: number },
  paidFetch: PaidFetch,
): Promise<HopResult> {
  const url = `${input.baseUrl.replace(/\/+$/, "")}/api/x402/agents/${encodeURIComponent(input.agent.id)}/task`
  let response: Response
  try {
    response = await paidFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: input.task.slice(0, 2000),
        agent: {
          name: input.agent.name,
          role: input.agent.role,
          connection: { provider: input.agent.connection.provider, model: input.agent.connection.model, apiKey: input.agent.connection.apiKey },
        },
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 75_000),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error"
    return { ok: false, error: `the payment could not be made (${message.slice(0, 200)})` }
  }

  const data = await response.json().catch(() => null) as Record<string, unknown> | null
  const receipt = receiptFromBody(data?.receipt) ?? receiptFromHeader(response)
  if (response.ok && data?.ok === true && typeof data.result === "string" && receipt) {
    return { ok: true, answer: data.result, receipt }
  }
  const reason = typeof data?.error === "string" && data.error
    ? data.error
    : response.status === 402 ? "the agent's endpoint did not accept the payment" : `the agent's endpoint answered HTTP ${response.status}`
  return receipt ? { ok: false, error: reason.slice(0, 300), receipt } : { ok: false, error: reason.slice(0, 300) }
}
