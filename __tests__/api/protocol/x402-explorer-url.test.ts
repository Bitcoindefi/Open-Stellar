import { describe, expect, it, afterEach, vi } from "vitest"
import { getExplorerUrl, createX402Quote, settleX402 } from "@/lib/protocols/x402"

describe("getExplorerUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns testnet URLs when NODE_ENV is not production", () => {
    vi.stubEnv("NODE_ENV", "test")
    expect(getExplorerUrl("stellar", "abc123")).toBe(
      "https://stellar.expert/explorer/testnet/tx/abc123",
    )
    expect(getExplorerUrl("bnb", "0xdeadbeef")).toBe(
      "https://testnet.bscscan.com/tx/0xdeadbeef",
    )
    expect(getExplorerUrl("base", "0xcafebabe")).toBe(
      "https://sepolia.basescan.org/tx/0xcafebabe",
    )
  })

  it("returns mainnet URLs when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(getExplorerUrl("stellar", "abc123")).toBe(
      "https://stellar.expert/explorer/mainnet/tx/abc123",
    )
    expect(getExplorerUrl("bnb", "0xdeadbeef")).toBe(
      "https://bscscan.com/tx/0xdeadbeef",
    )
    expect(getExplorerUrl("base", "0xcafebabe")).toBe(
      "https://basescan.org/tx/0xcafebabe",
    )
  })
})

describe("settleX402 explorerUrl", () => {
  it("includes explorerUrl in settlement receipt for all chains", () => {
    for (const chain of ["stellar", "bnb", "base"] as const) {
      const txHash =
        chain === "stellar"
          ? `${"A".repeat(64)}`
          : `0x${"a".repeat(64)}`

      const quote = createX402Quote({
        serviceId: "url-test-svc",
        chain,
        payer: "url-test-payer",
        units: 1,
        unitPriceUsd: 0.01,
      })

      const result = settleX402({
        paymentRef: quote.paymentRef,
        chain,
        txHash,
        paidBy: quote.payer,
      })

      expect(result.ok).toBe(true)
      expect(result.receipt?.explorerUrl).toContain(txHash)
      expect(result.receipt?.explorerUrl).toMatch(/^https:\/\//)
    }
  })
})
