import { describe, expect, it } from "vitest"
import { GET as listReceipts } from "@/app/api/protocol/x402/receipts/route"
import { GET as getReceipt } from "@/app/api/protocol/x402/receipts/[receiptId]/route"
import { createX402Quote, settleX402 } from "@/lib/protocols/x402"

describe("GET /api/protocol/x402/receipts", () => {
  it("lists persisted receipts and filters by agent", async () => {
    const quote = createX402Quote({
      serviceId: "data-indexing",
      chain: "stellar",
      payer: "nexus-7",
      units: 1,
      unitPriceUsd: 0.01,
    })
    const settlement = settleX402({
      paymentRef: quote.paymentRef,
      chain: quote.chain,
      txHash: `0x${"b".repeat(64)}`,
      paidBy: quote.payer,
    })

    const res = await listReceipts(new Request("http://localhost/api/protocol/x402/receipts?agent=nexus-7&pageSize=50"))
    const data = await res.json()

    expect(settlement.ok).toBe(true)
    expect(data.ok).toBe(true)
    expect(data.receipts[0]).toMatchObject({
      agentId: "nexus-7",
      service: "data-indexing",
      amount: "0.01 USD",
      passportVerified: true,
    })
  })

  it("returns a single receipt by id", async () => {
    const listRes = await listReceipts(new Request("http://localhost/api/protocol/x402/receipts?pageSize=1"))
    const listData = await listRes.json()
    const receiptId = listData.receipts[0].id

    const res = await getReceipt(new Request(`http://localhost/api/protocol/x402/receipts/${receiptId}`), {
      params: Promise.resolve({ receiptId }),
    })
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.receipt.id).toBe(receiptId)
  })
})
