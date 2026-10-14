import { NextResponse } from "next/server"
import { x402ResourceServer } from "@x402/core/server"
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from "@x402/core/http"
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types"
import { ExactEvmScheme } from "@x402/evm/exact/server"
import { privateKeyToAccount } from "viem/accounts"
import { getAddress } from "viem"
import { ARC_FACILITATOR_URL, ARC_TESTNET_CAIP2, isEvmAddress, sameEvmAddress } from "@/lib/rails/arc/constants"
import { CircleFacilitatorClient, FacilitatorHttpError, paymentIdentifierFor, settlementPendingOf } from "@/lib/rails/arc/facilitator"
import { getKvStore, type KvStore } from "@/lib/security/kv-store"

// Standard x402 (v2, scheme "exact", EIP-3009) on Arc testnet, paid in USDC and settled by
// Circle's Facilitator Service, which also pays the gas. Same contract as lib/solana/x402.ts:
// verify -> settle -> the caller does the work, and nothing is delivered until the payment is
// final. A settlement still pending answers 409 and is remembered in KV (ac:arc:x402:*), so the
// same signed payment, sent again, settles once (Circle deduplicates by payment-identifier)
// instead of being charged twice.

export const ARC_PENDING_TTL_SECONDS = 24 * 60 * 60
export const ARC_SETTLED_TTL_SECONDS = 7 * 24 * 60 * 60
const pendingKey = (id: string) => `ac:arc:x402:pending:${id}`
const settledKey = (id: string) => `ac:arc:x402:settled:${id}`

export type ArcPaidRequest = { ok: true; settle: SettleResponse; requirements: PaymentRequirements; payer: string | null; paymentId: string | null }
export type ArcUnpaidRequest = { ok: false; response: Response }

export type ArcPaymentConfig = { payTo: `0x${string}`; facilitator: CircleFacilitatorClient }

function noStore(body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

export function getArcPayTo(env: Record<string, string | undefined> = process.env): `0x${string}` | null {
  const value = env.X402_ARC_PAY_TO?.trim()
  return isEvmAddress(value) ? getAddress(value) : null
}

/**
 * Builds the facilitator client from env: ARC_SELLER_PROOF_KEY (the key that controls
 * X402_ARC_PAY_TO, for the keyless trial) and/or CIRCLE_API_KEY. Null when neither is usable, or
 * when the proof key does not control payTo (Circle would reject every proof).
 */
export function arcPaymentConfigFromEnv(env: Record<string, string | undefined> = process.env): ArcPaymentConfig | null {
  const payTo = getArcPayTo(env)
  if (!payTo) return null
  const rawKey = env.ARC_SELLER_PROOF_KEY?.trim()
  const apiKey = env.CIRCLE_API_KEY?.trim() || null
  let seller = null
  if (rawKey) {
    try {
      seller = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`)
    } catch {
      console.error("[x402:arc] ARC_SELLER_PROOF_KEY is not a valid private key.")
      return null
    }
    if (!sameEvmAddress(seller.address, payTo)) {
      console.error("[x402:arc] ARC_SELLER_PROOF_KEY does not control X402_ARC_PAY_TO.")
      return null
    }
  }
  if (!seller && !apiKey) return null
  const url = env.X402_ARC_FACILITATOR_URL?.trim() || ARC_FACILITATOR_URL
  return { payTo, facilitator: new CircleFacilitatorClient({ url, seller, apiKey, network: ARC_TESTNET_CAIP2 }) }
}

type ConfigFactory = () => ArcPaymentConfig | null
let configFactory: ConfigFactory = () => arcPaymentConfigFromEnv()
let storeFactory: () => KvStore = () => getKvStore()
let ready: { config: ArcPaymentConfig; server: Promise<x402ResourceServer> } | null = null

/** Test seam: swap the facilitator config and the KV store. */
export function setArcPaymentForTests(factory: ConfigFactory | null, store?: KvStore | null) {
  configFactory = factory ?? (() => arcPaymentConfigFromEnv())
  storeFactory = store ? () => store : () => getKvStore()
  ready = null
}

function getServer(config: ArcPaymentConfig): Promise<x402ResourceServer> {
  if (!ready || ready.config !== config) {
    const server = new x402ResourceServer(config.facilitator).register(ARC_TESTNET_CAIP2, new ExactEvmScheme())
    const promise = server.initialize().then(() => server).catch((error) => {
      ready = null
      throw error
    })
    ready = { config, server: promise }
  }
  return ready.server
}

let cachedConfig: { factory: ConfigFactory; config: ArcPaymentConfig | null } | null = null
function currentConfig(): ArcPaymentConfig | null {
  if (!cachedConfig || cachedConfig.factory !== configFactory) cachedConfig = { factory: configFactory, config: configFactory() }
  return cachedConfig.config
}

/**
 * Charges `price` (e.g. "$0.01") in Arc testnet USDC before the caller runs its work.
 * Without a PAYMENT-SIGNATURE header it answers 402 with PAYMENT-REQUIRED.
 */
export async function requireArcPayment(req: Request, options: { price: string; description: string }): Promise<ArcPaidRequest | ArcUnpaidRequest> {
  const config = currentConfig()
  if (!config) return { ok: false, response: noStore({ ok: false, error: "Arc payments are not configured on this server." }, 503) }

  let server: x402ResourceServer
  let accepts: PaymentRequirements[]
  try {
    server = await getServer(config)
    accepts = await server.buildPaymentRequirements({ scheme: "exact", payTo: config.payTo, price: options.price, network: ARC_TESTNET_CAIP2, maxTimeoutSeconds: 60 })
  } catch (error) {
    console.error("[x402:arc] facilitator unavailable:", error instanceof Error ? error.message : error)
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
  const paymentId = paymentIdentifierFor(payload)
  if (!paymentId) return challenge("The payment has no EIP-3009 authorization")

  const store = storeFactory()
  try {
    // A payment that already delivered its task is not accepted again (Circle would answer the
    // same settlement, so without this a copied header could buy the task twice).
    if (await store.get(settledKey(paymentId))) return { ok: false, response: noStore({ ok: false, error: "This payment was already used." }, 409) }

    // The retry of a pending settlement skips verify: its nonce may already be spent on-chain.
    const wasPending = Boolean(await store.get(pendingKey(paymentId)))
    let verifiedPayer: string | null = null
    if (!wasPending) {
      const verified = await server.verifyPayment(payload, requirements)
      if (!verified.isValid) return challenge(verified.invalidMessage || verified.invalidReason || "Payment could not be verified")
      verifiedPayer = verified.payer ?? null
    }

    const settle = await server.settlePayment(payload, requirements)
    const pending = settlementPendingOf(settle)
    if (pending) {
      await store.set(pendingKey(paymentId), JSON.stringify({ paymentId: pending.paymentId, statusUrl: pending.statusUrl ?? null, at: Date.now() }), ARC_PENDING_TTL_SECONDS)
      return {
        ok: false,
        response: noStore({ ok: false, pending: true, error: "The payment is still settling on Arc. Nothing was delivered yet; send the same payment again in a moment." }, 409),
      }
    }
    if (!settle.success) return challenge(settle.errorMessage || settle.errorReason || "Payment could not be settled")

    const claimed = await store.set(settledKey(paymentId), settle.transaction, ARC_SETTLED_TTL_SECONDS, { onlyIfAbsent: true })
    if (!claimed) return { ok: false, response: noStore({ ok: false, error: "This payment was already used." }, 409) }
    if (wasPending) await store.del(pendingKey(paymentId)).catch(() => undefined)
    const payer = settle.payer ?? verifiedPayer
    return { ok: true, settle, requirements, payer: isEvmAddress(payer) ? getAddress(payer) : null, paymentId }
  } catch (error) {
    console.error("[x402:arc] verify/settle failed:", error instanceof Error ? error.message : error)
    // 403 registration_required: the keyless trial allowance for this payTo is used up.
    if (error instanceof FacilitatorHttpError && error.status === 403) {
      return { ok: false, response: noStore({ ok: false, error: "Arc payments are paused on this server (facilitator registration required)." }, 503) }
    }
    return challenge("Payment failed")
  }
}
