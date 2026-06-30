import { describe, it, expect } from "vitest"
import { POST as postQuote } from "@/app/api/protocol/x402/quote/route"
import { POST as postSettle } from "@/app/api/protocol/x402/settle/route"

// The quote registry is in-memory on globalThis; no network calls needed.

async function makeQuote(overrides: Record<string, unknown> = {}) {
  const req = new Request("http://localhost/api/protocol/x402/quote", {
    method: "POST",
    body: JSON.stringify({
      serviceId: "test-svc",
      chain: "stellar",
      payer: "agent-x402-test",
      units: 1,
      unitPriceUsd: 0.05,
      ttlSeconds: 300,
      ...overrides,
    }),
    headers: { "Content-Type": "application/json" },
  })
  const res = await postQuote(req)
  return { res, data: await res.json() }
}

describe("POST /api/protocol/x402/quote", () => {
  it("creates a valid stellar quote", async () => {
    const { res, data } = await makeQuote()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.quote.chain).toBe("stellar")
    expect(data.quote.paymentRef).toMatch(/^test-svc:stellar:/)
    expect(data.quote.code).toBe(402)
    expect(typeof data.quote.amountUsd).toBe("number")
    expect(data.quote.amountUsd).toBeGreaterThan(0)
  })

  it("defaults unknown chain to bnb", async () => {
    const { data } = await makeQuote({ chain: "ethereum" })

    expect(data.ok).toBe(true)
    expect(data.quote.chain).toBe("bnb")
  })

  it("calculates correct amountUsd from units × unitPrice", async () => {
    const { data } = await makeQuote({ units: 3, unitPriceUsd: 0.10 })

    expect(data.ok).toBe(true)
    expect(data.quote.amountUsd).toBeCloseTo(0.3, 4)
  })

  it("includes expiry timestamp", async () => {
    const { data } = await makeQuote()

    expect(data.ok).toBe(true)
    const expiresAt = new Date(data.quote.expiresAt).getTime()
    expect(expiresAt).toBeGreaterThan(Date.now())
  })
})

describe("POST /api/protocol/x402/settle", () => {
  it("settles a valid quote", async () => {
    // Create a quote first
    const { data: quoteData } = await makeQuote({ payer: "agent-settle-test" })
    const paymentRef = quoteData.quote.paymentRef
    const mockTxHash = `0x${"a".repeat(64)}`

    const req = new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      body: JSON.stringify({
        paymentRef,
        chain: "stellar",
        txHash: mockTxHash,
        paidBy: "agent-settle-test",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await postSettle(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.receipt.accepted).toBe(true)
    expect(data.receipt.txHash).toBe(mockTxHash)
    expect(data.receipt.explorerUrl).toMatch(/stellar\.expert\/explorer\/(mainnet|testnet)\/tx\//)
  })

  it("rejects unknown paymentRef", async () => {
    const req = new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      body: JSON.stringify({
        paymentRef: "nonexistent:ref:123",
        chain: "stellar",
        txHash: `0x${"b".repeat(64)}`,
        paidBy: "someone",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await postSettle(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/not found/i)
  })

  it("rejects wrong chain", async () => {
    const { data: quoteData } = await makeQuote({ payer: "agent-wrong-chain" })
    const paymentRef = quoteData.quote.paymentRef

    const req = new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      body: JSON.stringify({
        paymentRef,
        chain: "bnb", // quote was stellar
        txHash: `0x${"c".repeat(64)}`,
        paidBy: "agent-wrong-chain",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await postSettle(req)
    const data = await res.json()

    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/chain/i)
  })

  it("rejects wrong payer", async () => {
    const { data: quoteData } = await makeQuote({ payer: "correct-payer" })
    const paymentRef = quoteData.quote.paymentRef

    const req = new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      body: JSON.stringify({
        paymentRef,
        chain: "stellar",
        txHash: `0x${"d".repeat(64)}`,
        paidBy: "wrong-payer",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await postSettle(req)
    const data = await res.json()

    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/payer/i)
  })

  it("rejects invalid txHash format", async () => {
    const { data: quoteData } = await makeQuote({ payer: "agent-bad-hash" })
    const paymentRef = quoteData.quote.paymentRef

    const req = new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      body: JSON.stringify({
        paymentRef,
        chain: "stellar",
        txHash: "not-a-valid-hash",
        paidBy: "agent-bad-hash",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await postSettle(req)
    const data = await res.json()

    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/hash/i)
  })
})
