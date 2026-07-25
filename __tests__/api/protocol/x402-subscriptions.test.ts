import { describe, expect, it, beforeEach } from "vitest"
import { GET as checkSubscription } from "@/app/api/protocol/x402/subscriptions/[agentId]/[serviceId]/route"
import { POST as createSubscription } from "@/app/api/protocol/x402/subscriptions/route"
import { checkX402Subscription, createX402Subscription, renewX402Subscriptions, resetX402SubscriptionsForTests } from "@/lib/protocols/x402"

describe("x402 subscriptions", () => {
  beforeEach(() => {
    resetX402SubscriptionsForTests()
  })

  it("creates a recurring subscription and charges the first month", async () => {
    const req = new Request("http://localhost/api/protocol/x402/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        serviceId: "my-data-api",
        agentId: "nexus-7",
        plan: "monthly",
        callsPerMonth: 1000,
        pricePerMonth: "5 XLM",
        walletBalanceXlm: 12,
      }),
    })

    const res = await createSubscription(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.subscription.active).toBe(true)
    expect(data.subscription.callsPerMonth).toBe(1000)
    expect(data.subscription.callsUsed).toBe(0)
    expect(data.subscription.billingEvents[0].type).toBe("initial_charge")
  })

  it("checks active access and consumes calls for withX402 gates", async () => {
    createX402Subscription({
      serviceId: "my-data-api",
      agentId: "nexus-7",
      plan: "starter",
      callsPerMonth: 2,
      pricePerMonth: "1 XLM",
    })

    const first = await checkSubscription(new Request("http://localhost/api/protocol/x402/subscriptions/nexus-7/my-data-api?consume=true"), {
      params: Promise.resolve({ agentId: "nexus-7", serviceId: "my-data-api" }),
    })
    const firstData = await first.json()
    const second = checkX402Subscription("nexus-7", "my-data-api", { consumeCall: true })
    const exhausted = checkX402Subscription("nexus-7", "my-data-api")

    expect(first.status).toBe(200)
    expect(firstData.active).toBe(true)
    expect(firstData.callsRemaining).toBe(1)
    expect(second.callsRemaining).toBe(0)
    expect(exhausted.active).toBe(false)
    expect(exhausted.status).toBe("exhausted")
  })

  it("moves renewals into grace and then paused when wallet balance is insufficient", () => {
    const startedAt = new Date("2026-06-22T00:00:00.000Z")
    createX402Subscription({
      serviceId: "my-data-api",
      agentId: "nexus-7",
      plan: "growth",
      now: startedAt,
      walletBalanceXlm: 10,
    })

    const grace = renewX402Subscriptions(new Date("2026-07-22T12:00:00.000Z"), { "nexus-7": 1 })
    const accessDuringGrace = checkX402Subscription("nexus-7", "my-data-api")

    expect(grace.paused[0].status).toBe("grace")
    expect(accessDuringGrace.active).toBe(true)

    const paused = renewX402Subscriptions(new Date("2026-07-23T12:01:00.000Z"), { "nexus-7": 1 })
    const accessAfterGrace = checkX402Subscription("nexus-7", "my-data-api")

    expect(paused.paused[0].status).toBe("paused")
    expect(accessAfterGrace.active).toBe(false)
    expect(accessAfterGrace.status).toBe("paused")
  })
})
