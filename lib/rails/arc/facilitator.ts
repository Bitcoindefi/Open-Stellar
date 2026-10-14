import type { FacilitatorClient } from "@x402/core/server"
import type { PaymentPayload, PaymentRequirements, SettleResponse, SupportedResponse, VerifyResponse } from "@x402/core/types"
import { keccak256, toBytes, toHex } from "viem"
import type { LocalAccount } from "viem/accounts"
import { ARC_FACILITATOR_URL, ARC_TESTNET_CAIP2 } from "@/lib/rails/arc/constants"

// Circle Facilitator Service client for x402 "exact" on Arc. Same surface as @x402/core's
// FacilitatorClient (getSupported, verify, settle), so it plugs into x402ResourceServer.
//
// Why not HTTPFacilitatorClient: during the keyless trial every call carries a seller proof, an
// EIP-712 signature by the key that controls payTo over keccak256 of the exact request body. The
// core client builds its auth headers before it serializes the body, so it cannot hash it. With
// CIRCLE_API_KEY the Bearer header is sent too; both can be set.
// Docs: https://developers.circle.com/facilitator-service/keyless-trial.md
//
// Settlement can come back pending (HTTP 200, success:false, errorReason "settlement_pending").
// The core server only retries a pending result that already has a transaction hash, and Circle's
// has none, so this client polls /status (with a fresh "status" proof, never re-signing the
// payment) until completed or failed. Still pending at the deadline comes back as success:false
// with errorReason "settlement_pending": the caller must not deliver anything.

export const SELLER_PROOF_HEADER = "Facilitator-Seller-Proof"
export const SETTLEMENT_PENDING = "settlement_pending"
export const PAYMENT_IDENTIFIER_EXTENSION = "payment-identifier"
export const SETTLEMENT_STATUS_EXTENSION = "settlement-status"
const PROOF_TTL_SECONDS = 300

export type SellerProofPurpose = "verify" | "settle" | "status"

export type SettlementStatus = { status: "pending"; paymentId: string; statusUrl?: string }

export type CircleFacilitatorOptions = {
  url?: string
  /** The key that controls payTo (ARC_SELLER_PROOF_KEY). Signs a proof per request. */
  seller?: LocalAccount | null
  /** CIRCLE_API_KEY: Bearer auth once the keyless trial runs out. */
  apiKey?: string | null
  network?: string
  fetchImpl?: typeof fetch
  /** How long settle waits for a pending settlement before giving up (the caller answers 409). */
  maxPendingWaitMs?: number
  pollIntervalMs?: number
  requestTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  randomNonce?: () => `0x${string}`
}

export class FacilitatorHttpError extends Error {
  constructor(readonly path: string, readonly status: number, readonly body: unknown) {
    super(`Circle facilitator ${path} answered HTTP ${status}`)
    this.name = "FacilitatorHttpError"
  }
}

const SELLER_REQUEST_TYPES = {
  SellerRequest: [
    { name: "purpose", type: "string" },
    { name: "method", type: "string" },
    { name: "bodyHash", type: "bytes32" },
    { name: "network", type: "string" },
    { name: "payTo", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const

function defaultNonce(): `0x${string}` {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url")
}

type SignedAuthorization = { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string }

function signedAuthorizationOf(payload: PaymentPayload): { authorization: SignedAuthorization; signature: string } | null {
  const inner = payload.payload as { authorization?: Record<string, unknown>; signature?: unknown } | undefined
  const auth = inner?.authorization
  if (!auth || typeof auth !== "object") return null
  const fields = ["from", "to", "value", "validAfter", "validBefore", "nonce"] as const
  const out: Record<string, string> = {}
  for (const field of fields) {
    const value = auth[field]
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null
    out[field] = String(value)
  }
  return { authorization: out as SignedAuthorization, signature: typeof inner?.signature === "string" ? inner.signature : "" }
}

/**
 * The payment-identifier for a payment, derived ONLY from data the buyer signed: "ac_" plus 48
 * hex characters of keccak256(from, nonce). EIP-3009 nonces are unique per payer, so a retry of
 * the same authorization always carries the same id (Circle settles it once), and nobody can
 * point their payment at someone else's id. Any payment-identifier the client sent is ignored:
 * extensions are not covered by the buyer's signature.
 */
export function paymentIdentifierFor(payload: PaymentPayload): string | null {
  const signed = signedAuthorizationOf(payload)
  if (!signed) return null
  const { from, nonce } = signed.authorization
  if (!/^0x[0-9a-fA-F]{40}$/.test(from) || !/^0x[0-9a-fA-F]{64}$/.test(nonce)) return null
  return `ac_${keccak256(toBytes(`${from.toLowerCase()}:${nonce.toLowerCase()}`)).slice(2, 50)}`
}

/**
 * keccak256 of the canonical signed part of a payment (authorization fields, signature and the
 * accepted requirements). Two payloads with the same hash are the same signed payment.
 */
export function signedPaymentHash(payload: PaymentPayload): string | null {
  const signed = signedAuthorizationOf(payload)
  if (!signed) return null
  const a = signed.authorization
  const accepted = (payload as { accepted?: Record<string, unknown> }).accepted ?? {}
  const canonical = JSON.stringify([
    a.from.toLowerCase(), a.to.toLowerCase(), a.value, a.validAfter, a.validBefore, a.nonce.toLowerCase(),
    signed.signature.toLowerCase(),
    String(accepted.scheme ?? ""), String(accepted.network ?? ""), String(accepted.asset ?? "").toLowerCase(),
    String(accepted.amount ?? ""), String(accepted.payTo ?? "").toLowerCase(),
  ])
  return keccak256(toBytes(canonical))
}

/** Always sets the server-derived payment-identifier, replacing whatever the client sent. */
export function withPaymentIdentifier(payload: PaymentPayload): PaymentPayload {
  const id = paymentIdentifierFor(payload)
  if (!id && !payload.extensions?.[PAYMENT_IDENTIFIER_EXTENSION]) return payload
  const extensions = { ...(payload.extensions ?? {}) }
  delete extensions[PAYMENT_IDENTIFIER_EXTENSION]
  if (!id) return { ...payload, extensions }
  return { ...payload, extensions: { ...extensions, [PAYMENT_IDENTIFIER_EXTENSION]: { info: { required: true, id } } } }
}

/** The pending marker of a settle result, when it is one. */
export function settlementPendingOf(result: SettleResponse | null | undefined): SettlementStatus | null {
  if (!result || result.success || result.errorReason !== SETTLEMENT_PENDING) return null
  const status = result.extensions?.[SETTLEMENT_STATUS_EXTENSION] as { paymentId?: unknown; statusUrl?: unknown } | undefined
  if (!status || typeof status.paymentId !== "string" || !status.paymentId) return null
  return { status: "pending", paymentId: status.paymentId, ...(typeof status.statusUrl === "string" ? { statusUrl: status.statusUrl } : {}) }
}

export class CircleFacilitatorClient implements FacilitatorClient {
  readonly url: string
  readonly network: string
  private readonly seller: LocalAccount | null
  private readonly apiKey: string | null
  private readonly fetchImpl: typeof fetch
  private readonly chainId: number
  private readonly maxPendingWaitMs: number
  private readonly pollIntervalMs: number
  private readonly requestTimeoutMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly randomNonce: () => `0x${string}`

  constructor(options: CircleFacilitatorOptions = {}) {
    this.url = (options.url ?? ARC_FACILITATOR_URL).replace(/\/+$/, "")
    this.network = options.network ?? ARC_TESTNET_CAIP2
    this.seller = options.seller ?? null
    this.apiKey = options.apiKey?.trim() || null
    if (!this.seller && !this.apiKey) throw new Error("The Circle facilitator needs a seller proof key or an API key.")
    this.fetchImpl = options.fetchImpl ?? fetch
    this.chainId = Number(this.network.split(":")[1])
    this.maxPendingWaitMs = options.maxPendingWaitMs ?? 20_000
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.now = options.now ?? Date.now
    this.randomNonce = options.randomNonce ?? defaultNonce
  }

  /** base64url JSON envelope of an EIP-712 "Circle Facilitator Seller Request" v1 signature. */
  async sellerProof(purpose: SellerProofPurpose, method: string, body: string): Promise<string> {
    if (!this.seller) throw new Error("No seller proof key configured.")
    const nonce = this.randomNonce()
    const issuedAt = Math.floor(this.now() / 1000)
    const expiresAt = issuedAt + PROOF_TTL_SECONDS
    const payTo = this.seller.address
    const signature = await this.seller.signTypedData({
      domain: { name: "Circle Facilitator Seller Request", version: "1", chainId: this.chainId },
      types: SELLER_REQUEST_TYPES,
      primaryType: "SellerRequest",
      message: {
        purpose,
        method: method.toUpperCase(),
        bodyHash: keccak256(toBytes(body)),
        network: this.network,
        payTo,
        nonce,
        issuedAt: BigInt(issuedAt),
        expiresAt: BigInt(expiresAt),
      },
    })
    return base64url(JSON.stringify({ version: 1, signature, network: this.network, payTo, nonce, issuedAt, expiresAt }))
  }

  private async call(purpose: SellerProofPurpose, method: "GET" | "POST", path: string, payload?: unknown): Promise<{ status: number; json: unknown }> {
    // Serialize once: the proof hashes exactly the bytes that are sent.
    const body = payload === undefined ? "" : JSON.stringify(payload)
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`
    if (this.seller) headers[SELLER_PROOF_HEADER] = await this.sellerProof(purpose, method, body)
    const response = await this.fetchImpl(`${this.url}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : body,
      cache: "no-store",
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    })
    const text = await response.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text.slice(0, 500) }
    }
    return { status: response.status, json }
  }

  async getSupported(): Promise<SupportedResponse> {
    const response = await this.fetchImpl(`${this.url}/supported`, { cache: "no-store", signal: AbortSignal.timeout(this.requestTimeoutMs) })
    if (!response.ok) throw new FacilitatorHttpError("/supported", response.status, null)
    return await response.json() as SupportedResponse
  }

  async verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    const { status, json } = await this.call("verify", "POST", "/verify", { x402Version: 2, paymentPayload: withPaymentIdentifier(paymentPayload), paymentRequirements })
    if (status !== 200) throw new FacilitatorHttpError("/verify", status, json)
    return json as VerifyResponse
  }

  /** One /settle call, without waiting for a pending settlement. */
  async settleOnce(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    const { status, json } = await this.call("settle", "POST", "/settle", { x402Version: 2, paymentPayload: withPaymentIdentifier(paymentPayload), paymentRequirements })
    if (status !== 200) throw new FacilitatorHttpError("/settle", status, json)
    return json as SettleResponse
  }

  /** GET /status/{paymentId}. */
  async status(paymentId: string): Promise<{ status?: string; transaction?: string; network?: string; payer?: string; amount?: string; reason?: string }> {
    const { status, json } = await this.call("status", "GET", `/status/${encodeURIComponent(paymentId)}`)
    if (status !== 200) throw new FacilitatorHttpError("/status", status, json)
    return (json ?? {}) as { status?: string }
  }

  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    const first = await this.settleOnce(paymentPayload, paymentRequirements)
    const pending = settlementPendingOf(first)
    if (!pending) return first
    return this.waitForSettlement(pending, first)
  }

  /** Polls /status until the settlement completes or fails, or the wait runs out. */
  async waitForSettlement(pending: SettlementStatus, last: SettleResponse, maxWaitMs: number = this.maxPendingWaitMs): Promise<SettleResponse> {
    const deadline = this.now() + maxWaitMs
    while (this.now() < deadline) {
      await this.sleep(this.pollIntervalMs)
      let current: Awaited<ReturnType<CircleFacilitatorClient["status"]>>
      try {
        current = await this.status(pending.paymentId)
      } catch {
        continue
      }
      if (current.status === "completed" && typeof current.transaction === "string" && current.transaction) {
        return {
          success: true,
          transaction: current.transaction,
          network: (current.network ?? last.network ?? this.network) as SettleResponse["network"],
          ...(current.payer ?? last.payer ? { payer: current.payer ?? last.payer } : {}),
          ...(current.amount ? { amount: current.amount } : {}),
        }
      }
      if (current.status === "failed") {
        return { success: false, errorReason: current.reason || "settlement_failed", transaction: "", network: (current.network ?? last.network ?? this.network) as SettleResponse["network"], ...(last.payer ? { payer: last.payer } : {}) }
      }
    }
    return last
  }
}
