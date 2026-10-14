import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const generate = vi.hoisted(() => vi.fn())
const requirePayment = vi.hoisted(() => vi.fn())
const requireArcPayment = vi.hoisted(() => vi.fn())
vi.mock("@/lib/ai/byok-provider", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/byok-provider")>()), generateWithByokProvider: generate }))
vi.mock("@/lib/solana/x402", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/solana/x402")>()), requirePayment }))
vi.mock("@/lib/rails/arc/x402", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/rails/arc/x402")>()), requireArcPayment }))

import { POST } from "@/app/api/x402/agents/[id]/task/route"
import { ARC_RECEIPTS_KEY, RECEIPTS_KEY, createMemoryReceiptBackend, readReceiptLog, setReceiptBackendForTests } from "@/lib/receipts/log"
import { createMemoryStore, getKvStore, setKvStoreForTests } from "@/lib/security/kv-store"

const TX = "0x9c5da2f5a1338bcd3fd5673beb22e1ef8f62690185cfb3196712a66128d5df3b"
const PAYER = "0x459E57c355b455Ef5544200B521e9b8994D8a451"
const settle = { success: true, transaction: TX, network: "eip155:5042002", payer: PAYER }
const paid = { ok: true, settle, payer: PAYER, paymentId: "ac_0cd1", requirements: { amount: "10000", asset: "0x3600000000000000000000000000000000000000" } }
const agent = { name: "Investigador", role: "Research", connection: { provider: "openrouter", model: "x-ai/grok-4", apiKey: "or-key-123456" } }

function post(body: unknown, query = "?network=arc", id = "agent-1") {
  return POST(new Request(`https://agentic-city.test/api/x402/agents/${id}/task${query}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
}

describe("POST /api/x402/agents/[id]/task?network=arc", () => {
  const env = { ...process.env }
  beforeEach(() => {
    generate.mockReset().mockResolvedValue("respuesta")
    requirePayment.mockReset()
    requireArcPayment.mockReset().mockResolvedValue(paid)
  })
  afterEach(() => {
    process.env = { ...env }
    vi.restoreAllMocks()
  })

  it("refuses Arc while NEXT_PUBLIC_ENABLE_ARC is off, before charging", async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_ARC
    const res = await post({ task: "hola", agent })
    expect(res.status).toBe(400)
    expect(requireArcPayment).not.toHaveBeenCalled()
    expect(requirePayment).not.toHaveBeenCalled()
  })

  it("charges on Arc, records an arc-testnet receipt in its own list and links the Arc explorer", async () => {
    process.env.NEXT_PUBLIC_ENABLE_ARC = "true"
    const backend = createMemoryReceiptBackend()
    setReceiptBackendForTests(backend)
    setKvStoreForTests(createMemoryStore())
    try {
      const res = await post({ task: "resumí x402", agent })
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(requirePayment).not.toHaveBeenCalled()
      expect(data.receipt).toMatchObject({ transaction: TX, network: "eip155:5042002", explorerUrl: `https://explorer.testnet.arc.io/tx/${TX}` })
      expect(res.headers.get("PAYMENT-RESPONSE")).toBeTruthy()
      // The agent is told where it was paid.
      expect(generate.mock.calls[0][1]).toContain("USDC on Arc testnet")
      const [record] = await readReceiptLog(backend, ARC_RECEIPTS_KEY)
      expect(record).toMatchObject({ type: "payment", tx: TX, network: "arc-testnet", amount: "10000", asset: "USDC", payer: "0x459E…a451" })
      expect(await readReceiptLog(backend, RECEIPTS_KEY)).toEqual([])
      expect(await getKvStore().get(`ac:arc:x402:paid:${TX}`)).toBe("legacy/agent-1")
    } finally {
      setReceiptBackendForTests(null)
      setKvStoreForTests(null)
    }
  })

  it("passes the payment's own answer through when it is not settled (402 or 409 pending)", async () => {
    process.env.NEXT_PUBLIC_ENABLE_ARC = "true"
    requireArcPayment.mockResolvedValue({ ok: false, response: Response.json({ ok: false, pending: true }, { status: 409 }) })
    const res = await post({ task: "hola", agent })
    expect(res.status).toBe(409)
    expect(generate).not.toHaveBeenCalled()
  })
})
