import { describe, expect, it } from "vitest"
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types"
import { keccak256, toBytes, verifyTypedData } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ARC_TESTNET_CAIP2, ARC_USDC_ADDRESS } from "@/lib/rails/arc/constants"
import {
  CircleFacilitatorClient,
  FacilitatorHttpError,
  SELLER_PROOF_HEADER,
  paymentIdentifierFor,
  settlementPendingOf,
  withPaymentIdentifier,
} from "@/lib/rails/arc/facilitator"

const seller = privateKeyToAccount(generatePrivateKey())
const payer = privateKeyToAccount(generatePrivateKey())
const NONCE = `0x${"0cd165737935feebff31d1876210249aa67bc5efacf4c3d7b14dce28e3d29e5f"}`
const TX = `0x${"9c5da2f5a1338bcd3fd5673beb22e1ef8f62690185cfb3196712a66128d5df3b"}`

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: ARC_TESTNET_CAIP2,
  amount: "10000",
  asset: ARC_USDC_ADDRESS,
  payTo: seller.address,
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2" },
}

const payload: PaymentPayload = {
  x402Version: 2,
  accepted: requirements,
  payload: {
    authorization: { from: payer.address, to: seller.address, value: "10000", validAfter: "0", validBefore: "1791952885", nonce: NONCE },
    signature: "0x98f4",
  },
}

type Call = { url: string; method: string; headers: Record<string, string>; body: string }

/** A fake Circle facilitator: scripted answers per path, every call recorded. */
function fakeCircle(routes: Record<string, Array<{ status?: number; body: unknown }>>) {
  const calls: Call[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, body: typeof init.body === "string" ? init.body : "" })
    const path = Object.keys(routes).find((key) => new URL(url).pathname.endsWith(key))
    const queue = path ? routes[path] : undefined
    const next = queue && (queue.length > 1 ? queue.shift() : queue[0])
    if (!next) return new Response("not found", { status: 404 })
    return Response.json(next.body, { status: next.status ?? 200 })
  }) as typeof fetch
  return { calls, fetchImpl }
}

function client(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof CircleFacilitatorClient>[0]> = {}) {
  let clock = 1_791_952_800_000
  return new CircleFacilitatorClient({
    url: "https://facilitator.test/v1/facilitator/x402",
    seller,
    fetchImpl,
    sleep: async (ms) => { clock += ms },
    now: () => clock,
    pollIntervalMs: 2_000,
    maxPendingWaitMs: 10_000,
    ...extra,
  })
}

function decodeProof(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
    version: number; signature: `0x${string}`; network: string; payTo: `0x${string}`; nonce: `0x${string}`; issuedAt: number; expiresAt: number
  }
}

describe("Circle facilitator client (Arc testnet)", () => {
  it("needs a seller proof key or an API key", () => {
    expect(() => new CircleFacilitatorClient({ seller: null, apiKey: null })).toThrow(/seller proof key or an API key/)
  })

  it("reads /supported without auth", async () => {
    const fake = fakeCircle({ "/supported": [{ body: { kinds: [{ x402Version: 2, scheme: "exact", network: ARC_TESTNET_CAIP2 }], extensions: ["payment-identifier", "settlement-status"], signers: {} } }] })
    const supported = await client(fake.fetchImpl).getSupported()
    expect(supported.kinds[0]).toMatchObject({ scheme: "exact", network: ARC_TESTNET_CAIP2 })
    expect(fake.calls[0].headers[SELLER_PROOF_HEADER]).toBeUndefined()
  })

  it("signs a seller proof over keccak256 of the exact body it sends to /verify", async () => {
    const fake = fakeCircle({ "/verify": [{ body: { isValid: true, payer: payer.address.toLowerCase() } }] })
    const result = await client(fake.fetchImpl).verify(payload, requirements)
    expect(result.isValid).toBe(true)

    const call = fake.calls[0]
    expect(call.method).toBe("POST")
    const sent = JSON.parse(call.body)
    expect(sent.paymentPayload.extensions["payment-identifier"].info.id).toBe(`ac_${NONCE.slice(2, 50)}`)
    const proof = decodeProof(call.headers[SELLER_PROOF_HEADER])
    expect(proof).toMatchObject({ version: 1, network: ARC_TESTNET_CAIP2, payTo: seller.address })
    expect(proof.expiresAt - proof.issuedAt).toBe(300)
    const valid = await verifyTypedData({
      address: seller.address,
      domain: { name: "Circle Facilitator Seller Request", version: "1", chainId: 5042002 },
      types: { SellerRequest: [
        { name: "purpose", type: "string" }, { name: "method", type: "string" }, { name: "bodyHash", type: "bytes32" }, { name: "network", type: "string" },
        { name: "payTo", type: "address" }, { name: "nonce", type: "bytes32" }, { name: "issuedAt", type: "uint64" }, { name: "expiresAt", type: "uint64" },
      ] },
      primaryType: "SellerRequest",
      message: { purpose: "verify", method: "POST", bodyHash: keccak256(toBytes(call.body)), network: ARC_TESTNET_CAIP2, payTo: seller.address, nonce: proof.nonce, issuedAt: BigInt(proof.issuedAt), expiresAt: BigInt(proof.expiresAt) },
      signature: proof.signature,
    })
    expect(valid).toBe(true)
  })

  it("sends the Bearer API key when one is configured, with or without the proof", async () => {
    const fake = fakeCircle({ "/verify": [{ body: { isValid: true } }] })
    await client(fake.fetchImpl, { seller: null, apiKey: "test-key-123" }).verify(payload, requirements)
    expect(fake.calls[0].headers.Authorization).toBe("Bearer test-key-123")
    expect(fake.calls[0].headers[SELLER_PROOF_HEADER]).toBeUndefined()
  })

  it("returns a settled payment directly", async () => {
    const fake = fakeCircle({ "/settle": [{ body: { success: true, payer: payer.address.toLowerCase(), transaction: TX, network: ARC_TESTNET_CAIP2, amount: "10000" } }] })
    const result = await client(fake.fetchImpl).settle(payload, requirements)
    expect(result).toMatchObject({ success: true, transaction: TX })
    expect(fake.calls).toHaveLength(1)
  })

  it("polls /status on settlement_pending until completed, without re-signing the payment", async () => {
    const pending = { success: false, errorReason: "settlement_pending", transaction: "", network: ARC_TESTNET_CAIP2, payer: payer.address,
      extensions: { "settlement-status": { status: "pending", paymentId: "pay_1", statusUrl: "https://facilitator.test/v1/facilitator/x402/status/pay_1" } } }
    const fake = fakeCircle({
      "/settle": [{ body: pending }],
      "/status/pay_1": [{ body: { paymentId: "pay_1", status: "pending" } }, { body: { paymentId: "pay_1", status: "completed", transaction: TX, network: ARC_TESTNET_CAIP2, amount: "10000" } }],
    })
    const result = await client(fake.fetchImpl).settle(payload, requirements)
    expect(result).toMatchObject({ success: true, transaction: TX, payer: payer.address })
    const statusCalls = fake.calls.filter((call) => call.url.includes("/status/"))
    expect(statusCalls).toHaveLength(2)
    expect(statusCalls[0].method).toBe("GET")
    expect(statusCalls[0].body).toBe("")
    // The status proof says "status" and hashes the empty body.
    expect(decodeProof(statusCalls[0].headers[SELLER_PROOF_HEADER]).payTo).toBe(seller.address)
    expect(fake.calls.filter((call) => call.url.endsWith("/settle"))).toHaveLength(1)
  })

  it("keeps a settlement that is still pending at the deadline as pending (nothing to deliver)", async () => {
    const pending = { success: false, errorReason: "settlement_pending", transaction: "", network: ARC_TESTNET_CAIP2,
      extensions: { "settlement-status": { status: "pending", paymentId: "pay_2" } } }
    const fake = fakeCircle({ "/settle": [{ body: pending }], "/status/pay_2": [{ body: { status: "pending" } }] })
    const result = await client(fake.fetchImpl).settle(payload, requirements)
    expect(result.success).toBe(false)
    expect(settlementPendingOf(result)).toEqual({ status: "pending", paymentId: "pay_2" })
  })

  it("maps a failed settlement to success:false", async () => {
    const pending = { success: false, errorReason: "settlement_pending", transaction: "", network: ARC_TESTNET_CAIP2,
      extensions: { "settlement-status": { status: "pending", paymentId: "pay_3" } } }
    const fake = fakeCircle({ "/settle": [{ body: pending }], "/status/pay_3": [{ body: { status: "failed", reason: "insufficient_funds" } }] })
    const result = await client(fake.fetchImpl).settle(payload, requirements)
    expect(result).toMatchObject({ success: false, errorReason: "insufficient_funds", transaction: "" })
    expect(settlementPendingOf(result)).toBeNull()
  })

  it("throws a typed error on HTTP errors such as 403 registration_required", async () => {
    const fake = fakeCircle({ "/settle": [{ status: 403, body: { error: "registration_required" } }] })
    const error = await client(fake.fetchImpl).settle(payload, requirements).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FacilitatorHttpError)
    expect(error).toMatchObject({ status: 403, path: "/settle" })
  })

  it("derives a stable payment-identifier from the EIP-3009 nonce and keeps one already present", () => {
    expect(paymentIdentifierFor(payload)).toBe(`ac_${NONCE.slice(2, 50)}`)
    expect(paymentIdentifierFor(withPaymentIdentifier(payload))).toBe(paymentIdentifierFor(payload))
    const custom = { ...payload, extensions: { "payment-identifier": { info: { required: true, id: "custom_identifier_123" } } } }
    expect(paymentIdentifierFor(custom)).toBe("custom_identifier_123")
    expect(withPaymentIdentifier(custom)).toBe(custom)
    expect(paymentIdentifierFor({ ...payload, payload: {} })).toBeNull()
  })
})
