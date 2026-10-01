import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http"
import type { x402ResourceServer } from "@x402/core/server"
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types"
import { X402_NETWORK, attachPaymentResponse, explorerTxUrl, getPayTo, requirePayment, setResourceServerFactoryForTests } from "@/lib/solana/x402"

const PAY_TO = "F8HEGS2wyZhLDXsFXRti74bRiGNUmEFS4SANZBU3p5h"
const requirement: PaymentRequirements = { scheme: "exact", network: X402_NETWORK, asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", amount: "10000", payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { feePayer: "fee" } }
const payload: PaymentPayload = { x402Version: 2, accepted: requirement, payload: { transaction: "base64tx" } }

function fakeServer(overrides: Record<string, unknown> = {}) {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    buildPaymentRequirements: vi.fn().mockResolvedValue([requirement]),
    createPaymentRequiredResponse: vi.fn(async (accepts, resource, error) => ({ x402Version: 2, resource, accepts, ...(error ? { error } : {}) })),
    findMatchingRequirements: vi.fn(() => requirement),
    verifyPayment: vi.fn().mockResolvedValue({ isValid: true, payer: "payer-address" }),
    settlePayment: vi.fn().mockResolvedValue({ success: true, transaction: "settle-sig", network: X402_NETWORK, payer: "payer-address" }),
    ...overrides,
  }
}

function install(server: ReturnType<typeof fakeServer>) {
  setResourceServerFactoryForTests(() => server as unknown as x402ResourceServer)
}

function paidRequest(headers: Record<string, string> = {}) {
  return new Request("https://agentic-city.test/api/x402/agents/a/task", { method: "POST", headers })
}

describe("requirePayment", () => {
  const original = process.env.X402_SOLANA_PAY_TO
  beforeEach(() => { process.env.X402_SOLANA_PAY_TO = PAY_TO })
  afterEach(() => {
    setResourceServerFactoryForTests(null)
    if (original === undefined) delete process.env.X402_SOLANA_PAY_TO
    else process.env.X402_SOLANA_PAY_TO = original
  })

  it("answers 503 when no pay-to address is configured", async () => {
    delete process.env.X402_SOLANA_PAY_TO
    expect(getPayTo()).toBeNull()
    const result = await requirePayment(paidRequest(), { price: "$0.01", description: "t" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(503)
  })

  it("answers 402 with a PAYMENT-REQUIRED header when unpaid", async () => {
    const server = fakeServer()
    install(server)
    const result = await requirePayment(paidRequest(), { price: "$0.01", description: "Task" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(402)
    const required = decodePaymentRequiredHeader(result.response.headers.get("PAYMENT-REQUIRED")!)
    expect(required.accepts[0]).toMatchObject({ payTo: PAY_TO, network: X402_NETWORK })
    expect(server.buildPaymentRequirements).toHaveBeenCalledWith({ scheme: "exact", payTo: PAY_TO, price: "$0.01", network: X402_NETWORK, maxTimeoutSeconds: 60 })
    expect(server.verifyPayment).not.toHaveBeenCalled()
  })

  it("verifies and settles a valid payment before the work runs", async () => {
    const server = fakeServer()
    install(server)
    const result = await requirePayment(paidRequest({ "payment-signature": encodePaymentSignatureHeader(payload) }), { price: "$0.01", description: "Task" })
    expect(result).toMatchObject({ ok: true, payer: "payer-address", settle: { transaction: "settle-sig" } })
    expect(server.verifyPayment).toHaveBeenCalledBefore(server.settlePayment)
  })

  it("rejects malformed, mismatched, invalid and unsettled payments with a new challenge", async () => {
    install(fakeServer())
    const malformed = await requirePayment(paidRequest({ "payment-signature": "%%%" }), { price: "$0.01", description: "t" })
    expect(!malformed.ok && malformed.response.status).toBe(402)

    install(fakeServer({ findMatchingRequirements: vi.fn(() => undefined) }))
    const mismatch = await requirePayment(paidRequest({ "payment-signature": encodePaymentSignatureHeader(payload) }), { price: "$0.01", description: "t" })
    expect(!mismatch.ok && (await mismatch.response.json()).error).toContain("does not match")

    install(fakeServer({ verifyPayment: vi.fn().mockResolvedValue({ isValid: false, invalidReason: "insufficient_funds" }) }))
    const invalid = await requirePayment(paidRequest({ "payment-signature": encodePaymentSignatureHeader(payload) }), { price: "$0.01", description: "t" })
    expect(!invalid.ok && (await invalid.response.json()).error).toBe("insufficient_funds")

    const settle = vi.fn().mockResolvedValue({ success: false, errorMessage: "blockhash expired", transaction: "", network: X402_NETWORK })
    install(fakeServer({ settlePayment: settle }))
    const unsettled = await requirePayment(paidRequest({ "payment-signature": encodePaymentSignatureHeader(payload) }), { price: "$0.01", description: "t" })
    expect(!unsettled.ok && (await unsettled.response.json()).error).toBe("blockhash expired")

    install(fakeServer({ settlePayment: vi.fn().mockRejectedValue(new Error("network down")) }))
    const thrown = await requirePayment(paidRequest({ "payment-signature": encodePaymentSignatureHeader(payload) }), { price: "$0.01", description: "t" })
    expect(!thrown.ok && (await thrown.response.json()).error).toBe("network down")
  })

  it("reports a facilitator that cannot start, then retries on the next call", async () => {
    const broken = fakeServer({ initialize: vi.fn().mockRejectedValue(new Error("facilitator offline")) })
    install(broken)
    const first = await requirePayment(paidRequest(), { price: "$0.01", description: "t" })
    expect(!first.ok && first.response.status).toBe(502)
    const healthy = fakeServer()
    setResourceServerFactoryForTests(() => healthy as unknown as x402ResourceServer)
    const second = await requirePayment(paidRequest(), { price: "$0.01", description: "t" })
    expect(!second.ok && second.response.status).toBe(402)
  })

  it("attaches a PAYMENT-RESPONSE header and builds explorer links", () => {
    const response = attachPaymentResponse(new Response("{}"), { success: true, transaction: "sig", network: X402_NETWORK })
    expect(decodePaymentResponseHeader(response.headers.get("PAYMENT-RESPONSE")!)).toMatchObject({ transaction: "sig" })
    expect(explorerTxUrl("abc")).toBe("https://explorer.solana.com/tx/abc?cluster=devnet")
  })
})
