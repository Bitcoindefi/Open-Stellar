import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  deliverSettlementWebhook,
  listSettlementWebhookLogs,
  resetSettlementWebhookLogPathForTests,
  resetSettlementWebhookRetryDelaysForTests,
  setSettlementWebhookLogPathForTests,
  setSettlementWebhookRetryDelaysForTests,
  type SettlementWebhookPayload,
} from "@/lib/protocols/x402-settlement-webhook"

const payload: SettlementWebhookPayload = {
  receiptId: "rcpt_123",
  agentId: "agent-nexus",
  amount: "1.25",
  asset: "XLM",
  settledAt: "2026-06-30T12:00:00.000Z",
  explorerUrl: "https://open-stellar.example/explorer?q=rcpt_123",
}

let temporaryDirectory: string

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "open-stellar-webhook-"))
  setSettlementWebhookLogPathForTests(join(temporaryDirectory, "webhook-log.json"))
  setSettlementWebhookRetryDelaysForTests([0, 0, 0])
})

afterEach(() => {
  resetSettlementWebhookLogPathForTests()
  resetSettlementWebhookRetryDelaysForTests()
  rmSync(temporaryDirectory, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe("x402 settlement webhook delivery", () => {
  it("skips delivery without WEBHOOK_URL", async () => {
    const fetcher = vi.fn<typeof fetch>()

    const result = await deliverSettlementWebhook(payload, { webhookUrl: "", fetcher })

    expect(result).toMatchObject({ status: "skipped", attempts: 0, payload })
    expect(fetcher).not.toHaveBeenCalled()
    expect(listSettlementWebhookLogs()).toEqual([])
  })

  it("posts the exact settlement payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))

    const result = await deliverSettlementWebhook(payload, {
      webhookUrl: "https://merchant.example/settlements",
      fetcher,
    })

    expect(result).toMatchObject({ status: "success", attempts: 1, retried: false })
    expect(fetcher).toHaveBeenCalledWith(
      "https://merchant.example/settlements",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    )
    expect(listSettlementWebhookLogs()).toMatchObject([
      { receiptId: "rcpt_123", attempt: 1, status: "success", responseStatus: 204 },
    ])
  })

  it("retries failures and succeeds on the third attempt", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await deliverSettlementWebhook(payload, {
      webhookUrl: "https://merchant.example/settlements",
      fetcher,
    })

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ status: "success", attempts: 3, retried: true })
    expect(listSettlementWebhookLogs().map((entry) => entry.status))
      .toEqual(["retried", "retried", "success"])
  })

  it("logs a terminal failure after three retries", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }))

    const result = await deliverSettlementWebhook(payload, {
      webhookUrl: "https://merchant.example/settlements",
      fetcher,
    })

    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(result).toMatchObject({ status: "failed", attempts: 4, retried: true })
    expect(listSettlementWebhookLogs().map((entry) => entry.status))
      .toEqual(["retried", "retried", "retried", "fail"])
  })
})
