import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POST as createQuote } from "@/app/api/protocol/x402/quote/route"
import { POST as settlePayment } from "@/app/api/protocol/x402/settle/route"
import { GET as testWebhook } from "@/app/api/webhooks/test/route"
import {
  resetSettlementWebhookLogPathForTests,
  resetSettlementWebhookRetryDelaysForTests,
  setSettlementWebhookLogPathForTests,
  setSettlementWebhookRetryDelaysForTests,
} from "@/lib/protocols/x402-settlement-webhook"

let temporaryDirectory: string

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "open-stellar-webhook-api-"))
  setSettlementWebhookLogPathForTests(join(temporaryDirectory, "webhook-log.json"))
  setSettlementWebhookRetryDelaysForTests([0, 0, 0])
  vi.stubEnv("NEXT_PUBLIC_MOCK_MODE", "false")
})

afterEach(() => {
  resetSettlementWebhookLogPathForTests()
  resetSettlementWebhookRetryDelaysForTests()
  rmSync(temporaryDirectory, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("GET /api/webhooks/test", () => {
  it("requires the gateway admin token", async () => {
    vi.stubEnv("MOLTBOT_GATEWAY_TOKEN", "admin-secret")

    const response = await testWebhook(new Request("http://localhost/api/webhooks/test"))

    expect(response.status).toBe(401)
  })

  it("returns a sample payload and skips cleanly when WEBHOOK_URL is unset", async () => {
    vi.stubEnv("MOLTBOT_GATEWAY_TOKEN", "admin-secret")
    vi.stubEnv("WEBHOOK_URL", "")

    const response = await testWebhook(new Request("http://localhost/api/webhooks/test", {
      headers: { Authorization: "Bearer admin-secret" },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      payload: {
        agentId: "test-agent",
        amount: "1",
        asset: "XLM",
      },
      delivery: { status: "skipped", attempts: 0 },
    })
  })
})

describe("POST /api/protocol/x402/settle webhook", () => {
  it("notifies WEBHOOK_URL after a successful settlement", async () => {
    vi.stubEnv("WEBHOOK_URL", "https://merchant.example/settlements")
    const webhookBodies: string[] = []
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes("api.coingecko.com")) {
        return new Response(JSON.stringify({
          stellar: { usd: 0.1 },
          binancecoin: { usd: 550 },
          ethereum: { usd: 3000 },
        }), { status: 200 })
      }

      webhookBodies.push(String(init?.body))
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal("fetch", fetcher)

    const quoteResponse = await createQuote(new Request("http://localhost/api/protocol/x402/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: "merchant-checkout",
        chain: "stellar",
        payer: "agent-webhook-test",
        units: 2,
        unitPriceUsd: 0.05,
      }),
    }))
    const quoteBody = await quoteResponse.json()

    const settlementResponse = await settlePayment(new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentRef: quoteBody.quote.paymentRef,
        chain: "stellar",
        txHash: `0x${"a".repeat(64)}`,
        paidBy: "agent-webhook-test",
      }),
    }))

    expect(settlementResponse.status).toBe(200)
    expect(webhookBodies).toHaveLength(1)
    expect(JSON.parse(webhookBodies[0])).toMatchObject({
      receiptId: expect.stringMatching(/^rcpt_/),
      agentId: "agent-webhook-test",
      amount: "1",
      asset: "XLM",
      explorerUrl: expect.stringContaining("/explorer?q=rcpt_"),
    })
  })
})
