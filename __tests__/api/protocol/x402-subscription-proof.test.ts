import { beforeEach, describe, expect, it } from "vitest"
import { GET as getSubscriptionProof } from "@/app/api/subscriptions/[id]/proof/route"
import { POST as postQuote } from "@/app/api/protocol/x402/quote/route"
import { POST as postSettle } from "@/app/api/protocol/x402/settle/route"
import { createX402Subscription, resetX402SubscriptionsForTests } from "@/lib/protocols/x402"
import { resetSubscriptionPaymentProofsForTests, SUBSCRIPTION_ANCHOR_CONTRACT_ID } from "@/lib/protocols/subscription-anchor"

describe("GET /api/subscriptions/:id/proof", () => {
  beforeEach(() => {
    resetX402SubscriptionsForTests()
    resetSubscriptionPaymentProofsForTests()
  })

  it("returns the latest anchored payment proof for a settled subscription", async () => {
    const subscription = createX402Subscription({
      serviceId: "my-data-api",
      agentId: "nexus-7",
      plan: "monthly",
      walletBalanceXlm: 10,
    })
    const quoteRes = await postQuote(new Request("http://localhost/api/protocol/x402/quote", {
      method: "POST",
      body: JSON.stringify({
        serviceId: subscription.serviceId,
        chain: "stellar",
        payer: subscription.agentId,
        units: 1,
        unitPriceUsd: 0.05,
      }),
      headers: { "Content-Type": "application/json" },
    }))
    const quoteData = await quoteRes.json()
    const txHash = `0x${"e".repeat(64)}`

    const settleRes = await postSettle(new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      body: JSON.stringify({
        paymentRef: quoteData.quote.paymentRef,
        chain: "stellar",
        txHash,
        paidBy: subscription.agentId,
        subscriptionId: subscription.id,
        lastPaymentLedger: 123456,
      }),
      headers: { "Content-Type": "application/json" },
    }))
    const proofRes = await getSubscriptionProof(new Request(`http://localhost/api/subscriptions/${subscription.id}/proof`), {
      params: Promise.resolve({ id: subscription.id }),
    })
    const proof = await proofRes.json()

    expect(settleRes.status).toBe(200)
    expect(proofRes.status).toBe(200)
    expect(proof).toMatchObject({
      ok: true,
      subscriptionId: subscription.id,
      isActive: true,
      lastPaymentLedger: 123456,
      lastPaymentTx: txHash,
      contractId: SUBSCRIPTION_ANCHOR_CONTRACT_ID,
    })
  })

  it("rejects a subscriptionId that does not belong to the settled quote", async () => {
    const subscription = createX402Subscription({
      serviceId: "my-data-api",
      agentId: "nexus-7",
      plan: "monthly",
      walletBalanceXlm: 10,
    })
    const quoteRes = await postQuote(new Request("http://localhost/api/protocol/x402/quote", {
      method: "POST",
      body: JSON.stringify({
        serviceId: "other-service",
        chain: "stellar",
        payer: subscription.agentId,
        units: 1,
        unitPriceUsd: 0.05,
      }),
      headers: { "Content-Type": "application/json" },
    }))
    const quoteData = await quoteRes.json()

    const settleRes = await postSettle(new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      body: JSON.stringify({
        paymentRef: quoteData.quote.paymentRef,
        chain: "stellar",
        txHash: `0x${"f".repeat(64)}`,
        paidBy: subscription.agentId,
        subscriptionId: subscription.id,
      }),
      headers: { "Content-Type": "application/json" },
    }))
    const data = await settleRes.json()

    expect(settleRes.status).toBe(400)
    expect(data.error).toMatch(/subscriptionId/i)
  })
})
