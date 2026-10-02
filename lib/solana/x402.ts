import { NextResponse } from "next/server"
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server"
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http"
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types"
import { SOLANA_DEVNET_CAIP2 } from "@x402/svm"
import { ExactSvmScheme } from "@x402/svm/exact/server"

// Standard x402 (v2, scheme "exact") on Solana devnet, paid in USDC.
// Order matters: verify -> settle -> do the work. A payment signed by the wallet expires in
// about a minute, so it is settled before running anything slow (an LLM call).

export const X402_NETWORK = SOLANA_DEVNET_CAIP2
export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator"
export { AGENT_TASK_PRICE, AGENT_TASK_PRICE_BASE_UNITS, USDC_DECIMALS, USDC_DEVNET_MINT, usdPriceToBaseUnits } from "@/lib/solana/payment-constants"

type ServerFactory = () => x402ResourceServer
let createServer: ServerFactory = () =>
  new x402ResourceServer(new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL?.trim() || DEFAULT_FACILITATOR_URL }))
    .register(X402_NETWORK, new ExactSvmScheme())
let ready: Promise<x402ResourceServer> | null = null

/** Test seam: swap the resource server (facilitator) implementation. */
export function setResourceServerFactoryForTests(factory: ServerFactory | null) {
  createServer = factory ?? (() => new x402ResourceServer(new HTTPFacilitatorClient({ url: DEFAULT_FACILITATOR_URL })).register(X402_NETWORK, new ExactSvmScheme()))
  ready = null
}

async function getServer(): Promise<x402ResourceServer> {
  if (!ready) {
    const server = createServer()
    ready = server.initialize().then(() => server).catch((error) => {
      ready = null
      throw error
    })
  }
  return ready
}

export function getPayTo(): string | null {
  return process.env.X402_SOLANA_PAY_TO?.trim() || null
}

export type PaidRequest = { ok: true; settle: SettleResponse; requirements: PaymentRequirements; payer: string | null }
export type UnpaidRequest = { ok: false; response: Response }

function noStore(body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

/**
 * Charges `price` (e.g. "$0.01") before the caller runs its work.
 * Without a PAYMENT-SIGNATURE header it answers 402 with PAYMENT-REQUIRED.
 */
export async function requirePayment(req: Request, options: { price: string; description: string }): Promise<PaidRequest | UnpaidRequest> {
  const payTo = getPayTo()
  if (!payTo) return { ok: false, response: noStore({ ok: false, error: "Payments are not configured on this server." }, 503) }

  let server: x402ResourceServer
  let accepts: PaymentRequirements[]
  try {
    server = await getServer()
    accepts = await server.buildPaymentRequirements({ scheme: "exact", payTo, price: options.price, network: X402_NETWORK, maxTimeoutSeconds: 60 })
  } catch (error) {
    // Facilitator internals stay in the server log, not in the response.
    console.error("[x402] facilitator unavailable:", error instanceof Error ? error.message : error)
    return { ok: false, response: noStore({ ok: false, error: "Payment facilitator unavailable. Try again later." }, 502) }
  }
  const resource = { url: req.url, description: options.description, mimeType: "application/json" }

  const challenge = async (error?: string) => {
    const required = await server.createPaymentRequiredResponse(accepts, resource, error)
    return { ok: false as const, response: noStore(required, 402, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required) }) }
  }

  const header = req.headers.get("payment-signature")
  if (!header) return challenge()

  let payload: PaymentPayload
  try {
    payload = decodePaymentSignatureHeader(header)
  } catch {
    return challenge("Invalid PAYMENT-SIGNATURE header")
  }
  const requirements = server.findMatchingRequirements(accepts, payload)
  if (!requirements) return challenge("The payment does not match what this endpoint accepts")

  try {
    const verified = await server.verifyPayment(payload, requirements)
    if (!verified.isValid) return challenge(verified.invalidMessage || verified.invalidReason || "Payment could not be verified")
    const settle = await server.settlePayment(payload, requirements)
    if (!settle.success) return challenge(settle.errorMessage || settle.errorReason || "Payment could not be settled")
    return { ok: true, settle, requirements, payer: settle.payer ?? verified.payer ?? null }
  } catch (error) {
    console.error("[x402] verify/settle failed:", error instanceof Error ? error.message : error)
    return challenge("Payment failed")
  }
}

export function attachPaymentResponse<T extends Response>(response: T, settle: SettleResponse): T {
  response.headers.set("PAYMENT-RESPONSE", encodePaymentResponseHeader(settle))
  return response
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`
}
