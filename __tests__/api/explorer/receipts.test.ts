import { describe, expect, it } from "vitest"
import { createX402Quote, listX402ExplorerReceipts, settleX402 } from "@/lib/protocols/x402"

describe("x402 explorer receipts", () => {
  it("records accepted settlements for explorer queries", () => {
    const quote = createX402Quote({
      serviceId: "data-api",
      chain: "stellar",
      payer: "Nexus-7",
      units: 1,
      unitPriceUsd: 0.05,
    })

    const result = settleX402({
      paymentRef: quote.paymentRef,
      chain: quote.chain,
      txHash: `0x${"a".repeat(64)}`,
      paidBy: quote.payer,
    })

    const explorer = listX402ExplorerReceipts({ q: "Nexus-7", chain: "stellar" })

    expect(result.ok).toBe(true)
    expect(explorer.total).toBeGreaterThanOrEqual(1)
    expect(explorer.receipts[0]).toMatchObject({
      serviceId: "data-api",
      agent: "Nexus-7",
      chain: "stellar",
      amountUsd: 0.05,
    })
    expect(explorer.stats.totalPayments).toBeGreaterThanOrEqual(1)
  })

  it("paginates receipt responses", () => {
    const explorer = listX402ExplorerReceipts({ page: 1, pageSize: 1 })

    expect(explorer.page).toBe(1)
    expect(explorer.pageSize).toBe(1)
    expect(explorer.receipts.length).toBeLessThanOrEqual(1)
  })
})

