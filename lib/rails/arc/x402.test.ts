import { afterEach, describe, expect, it } from "vitest"
import { NextResponse } from "next/server"
import { decodePaymentRequiredHeader } from "@x402/core/http"
import type { PaymentRequirements } from "@x402/core/types"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ARC_TESTNET_CAIP2, ARC_USDC_ADDRESS } from "@/lib/rails/arc/constants"
import { CircleFacilitatorClient } from "@/lib/rails/arc/facilitator"
import { arcUsdcPolicy, createArcPaidFetch } from "@/lib/rails/arc/paid-fetch"
import { arcPaymentConfigFromEnv, requireArcPayment, setArcPaymentForTests } from "@/lib/rails/arc/x402"
import { createMemoryStore, type KvStore } from "@/lib/security/kv-store"

const treasury = privateKeyToAccount(generatePrivateKey())
const agent = privateKeyToAccount(generatePrivateKey())
const TX = `0x${"ab".repeat(32)}`
const URL_TASK = "https://agentic-city.test/api/x402/agents/nexus/task?network=arc"

const supported = { kinds: [{ x402Version: 2, scheme: "exact", network: ARC_TESTNET_CAIP2, extra: { name: "USDC", version: "2" } }], extensions: ["payment-identifier", "settlement-status"], signers: {} }
const pendingSettle = { success: false, errorReason: "settlement_pending", transaction: "", network: ARC_TESTNET_CAIP2, payer: agent.address,
  extensions: { "settlement-status": { status: "pending", paymentId: "pay_1" } } }
const doneSettle = { success: true, transaction: TX, network: ARC_TESTNET_CAIP2, payer: agent.address.toLowerCase(), amount: "10000" }

/** Fake Circle: scripted /settle answers; records what each call carried. */
function fakeCircle(settles: unknown[]) {
  const seen = { verify: 0, settle: [] as string[], status: 0 }
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname
    if (path.endsWith("/supported")) return Response.json(supported)
    const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null
    if (path.endsWith("/verify")) {
      seen.verify += 1
      const auth = body.paymentPayload.payload.authorization
      const ok = auth.to.toLowerCase() === treasury.address.toLowerCase() && auth.value === "10000"
      return Response.json(ok ? { isValid: true, payer: auth.from } : { isValid: false, invalidReason: "invalid_payload" })
    }
    if (path.endsWith("/settle")) {
      seen.settle.push(body.paymentPayload.extensions["payment-identifier"].info.id)
      return Response.json(settles.length > 1 ? settles.shift() : settles[0])
    }
    if (path.includes("/status/")) {
      seen.status += 1
      return Response.json({ status: "pending" })
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
  return { seen, fetchImpl }
}

function setup(settles: unknown[]) {
  const circle = fakeCircle(settles)
  const store: KvStore = createMemoryStore()
  const facilitator = new CircleFacilitatorClient({ seller: treasury, fetchImpl: circle.fetchImpl, maxPendingWaitMs: 0, sleep: async () => {} })
  setArcPaymentForTests(() => ({ payTo: treasury.address, facilitator }), store)
  // The task endpoint, in process: pays, then answers.
  const endpoint = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const payment = await requireArcPayment(new Request(String(input), init), { price: "$0.01", description: "Arc test task" })
    if (!payment.ok) return payment.response
    return NextResponse.json({ ok: true, result: "done", receipt: { transaction: payment.settle.transaction, payer: payment.payer } })
  }) as typeof fetch
  return { circle, store, endpoint }
}

afterEach(() => setArcPaymentForTests(null))

describe("x402 on Arc testnet (seller and buyer)", () => {
  it("answers 402 with Arc USDC requirements when there is no payment", async () => {
    const { endpoint } = setup([doneSettle])
    const response = await endpoint(URL_TASK, { method: "POST" })
    expect(response.status).toBe(402)
    const required = decodePaymentRequiredHeader(response.headers.get("PAYMENT-REQUIRED")!)
    expect(required.accepts[0]).toMatchObject({ scheme: "exact", network: ARC_TESTNET_CAIP2, asset: ARC_USDC_ADDRESS, amount: "10000", payTo: treasury.address, extra: { name: "USDC", version: "2" } })
  })

  it("pays once, delivers, and refuses the same payment replayed", async () => {
    const { endpoint, circle } = setup([doneSettle])
    let sentHeader = ""
    const recording = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const header = new Headers(init?.headers).get("payment-signature")
      if (header) sentHeader = header
      return endpoint(input, init)
    }) as typeof fetch
    const paid = createArcPaidFetch(agent, { maxAtomic: BigInt(10_000), payTo: treasury.address, fetchImpl: recording })
    const response = await paid(URL_TASK, { method: "POST", body: "{}" })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, receipt: { transaction: TX, payer: agent.address } })
    expect(circle.seen.verify).toBe(1)

    const replay = await endpoint(URL_TASK, { method: "POST", headers: { "payment-signature": sentHeader } })
    expect(replay.status).toBe(409)
    expect(await replay.json()).toMatchObject({ error: "This payment was already used." })
  })

  it("does not deliver while settlement is pending, then settles the same payment once on retry", async () => {
    const { endpoint, circle, store } = setup([pendingSettle, doneSettle])
    const statuses: number[] = []
    const recording = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await endpoint(input, init)
      statuses.push(response.status)
      return response
    }) as typeof fetch
    const paid = createArcPaidFetch(agent, { maxAtomic: BigInt(10_000), fetchImpl: recording, sleep: async () => {} })
    const response = await paid(URL_TASK, { method: "POST", body: "{}" })
    expect(statuses).toEqual([402, 409, 200])
    expect(response.status).toBe(200)
    // Verified once; the retry went straight to settle with the same payment-identifier.
    expect(circle.seen.verify).toBe(1)
    expect(circle.seen.settle).toHaveLength(2)
    expect(circle.seen.settle[0]).toBe(circle.seen.settle[1])
    expect(await store.get(`ac:arc:x402:pending:${circle.seen.settle[0]}`)).toBeNull()
    expect(await store.get(`ac:arc:x402:settled:${circle.seen.settle[0]}`)).toBe(TX)
  })

  it("remembers a pending settlement in KV and answers 409 without delivering", async () => {
    const { endpoint, circle, store } = setup([pendingSettle])
    const paid = createArcPaidFetch(agent, { maxAtomic: BigInt(10_000), fetchImpl: endpoint, pendingRetries: 0 })
    const response = await paid(URL_TASK, { method: "POST", body: "{}" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ ok: false, pending: true })
    const saved = JSON.parse((await store.get(`ac:arc:x402:pending:${circle.seen.settle[0]}`))!)
    expect(saved).toMatchObject({ paymentId: "pay_1" })
  })

  it("the buyer policy refuses another network, token, recipient or a bigger amount", async () => {
    const base: PaymentRequirements = { scheme: "exact", network: ARC_TESTNET_CAIP2, asset: ARC_USDC_ADDRESS, amount: "10000", payTo: treasury.address, maxTimeoutSeconds: 60, extra: {} }
    const policy = arcUsdcPolicy(BigInt(10_000), treasury.address)
    expect(policy(2, [base])).toHaveLength(1)
    expect(policy(2, [{ ...base, network: "eip155:84532" as PaymentRequirements["network"] }])).toHaveLength(0)
    expect(policy(2, [{ ...base, asset: "0x0000000000000000000000000000000000000001" }])).toHaveLength(0)
    expect(policy(2, [{ ...base, payTo: agent.address }])).toHaveLength(0)
    expect(policy(2, [{ ...base, amount: "10001" }])).toHaveLength(0)
    expect(policy(2, [{ ...base, amount: "not a number" }])).toHaveLength(0)

    const { endpoint } = setup([doneSettle])
    const paid = createArcPaidFetch(agent, { maxAtomic: BigInt(10_000), payTo: agent.address, fetchImpl: endpoint })
    await expect(paid(URL_TASK, { method: "POST", body: "{}" })).rejects.toThrow()
  })

  it("answers 503 when Arc payments are not configured", async () => {
    setArcPaymentForTests(() => null, createMemoryStore())
    const result = await requireArcPayment(new Request(URL_TASK, { method: "POST" }), { price: "$0.01", description: "x" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(503)
  })
})

describe("Arc payment config from env", () => {
  const key = generatePrivateKey()
  const owner = privateKeyToAccount(key)

  it("needs a payTo and a proof key that controls it, or an API key", () => {
    expect(arcPaymentConfigFromEnv({})).toBeNull()
    expect(arcPaymentConfigFromEnv({ X402_ARC_PAY_TO: owner.address })).toBeNull()
    expect(arcPaymentConfigFromEnv({ X402_ARC_PAY_TO: owner.address, ARC_SELLER_PROOF_KEY: key })?.payTo).toBe(owner.address)
    expect(arcPaymentConfigFromEnv({ X402_ARC_PAY_TO: owner.address, CIRCLE_API_KEY: "k" })?.payTo).toBe(owner.address)
    expect(arcPaymentConfigFromEnv({ X402_ARC_PAY_TO: treasury.address, ARC_SELLER_PROOF_KEY: key })).toBeNull()
    expect(arcPaymentConfigFromEnv({ X402_ARC_PAY_TO: "not an address", ARC_SELLER_PROOF_KEY: key })).toBeNull()
  })
})
