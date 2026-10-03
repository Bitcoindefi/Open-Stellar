import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const generate = vi.hoisted(() => vi.fn())
const requirePayment = vi.hoisted(() => vi.fn())
vi.mock("@/lib/ai/byok-provider", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/byok-provider")>()), generateWithByokProvider: generate }))
vi.mock("@/lib/solana/x402", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/solana/x402")>()), requirePayment }))

import { POST } from "@/app/api/x402/agents/[id]/task/route"
import { createMemoryStore, setKvStoreForTests } from "@/lib/security/kv-store"
import { getPaymentAgent } from "@/lib/solana/payment-bindings"
import { HOSTED_HEADER, signHostedTask } from "@/lib/mcp/crypto"

const settle = { success: true, transaction: "settle-sig", network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", payer: "payer" }
const paid = { ok: true, settle, payer: "payer", requirements: { amount: "10000", asset: "usdc-mint" } }
const agent = { name: "Investigador", role: "Research", connection: { provider: "openrouter", model: "x-ai/grok-4", apiKey: "or-key-123456" } }

function post(body: unknown, id = "agent-1") {
  return POST(new Request(`https://agentic-city.test/api/x402/agents/${id}/task`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
}

describe("POST /api/x402/agents/[id]/task", () => {
  beforeEach(() => {
    generate.mockReset().mockResolvedValue("respuesta")
    requirePayment.mockReset().mockResolvedValue(paid)
  })
  afterEach(() => vi.restoreAllMocks())

  it("charges first, then runs the agent and returns the result with a receipt", async () => {
    const res = await post({ task: "resumí x402", agent })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toMatchObject({ ok: true, agentId: "agent-1", result: "respuesta", receipt: { transaction: "settle-sig", payer: "payer", amount: "10000", explorerUrl: "https://explorer.solana.com/tx/settle-sig?cluster=devnet" } })
    expect(res.headers.get("PAYMENT-RESPONSE")).toBeTruthy()
    expect(requirePayment.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0])
    expect(generate.mock.calls[0][0]).toEqual({ provider: "openrouter", model: "x-ai/grok-4", apiKey: "or-key-123456" })
  })

  it("records which agent the settled payment was for, so it can be reviewed", async () => {
    setKvStoreForTests(createMemoryStore())
    try {
      expect((await post({ task: "hola", agent })).status).toBe(200)
      expect(await getPaymentAgent("settle-sig")).toBe("legacy/agent-1")
      // A replayed signature never re-binds to another agent.
      await post({ task: "hola", agent }, "agent-2")
      expect(await getPaymentAgent("settle-sig")).toBe("legacy/agent-1")

      // If the store is down the paid task still completes.
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
      setKvStoreForTests({ ...createMemoryStore(), set: vi.fn().mockRejectedValue(new Error("KV SET failed")) })
      expect((await post({ task: "hola", agent })).status).toBe(200)
      expect(error).toHaveBeenCalled()
    } finally {
      setKvStoreForTests(null)
    }
  })

  it("validates the task and the model before asking for payment", async () => {
    expect((await post({ task: "", agent })).status).toBe(400)
    expect((await post({ task: "x".repeat(2001), agent })).status).toBe(400)
    expect((await post({ task: "hola", agent: { connection: { provider: "nope", model: "m", apiKey: "k-12345678" } } })).status).toBe(400)
    expect((await post({ task: "hola", agent: { connection: { provider: "openai", model: "m", apiKey: "short" } } })).status).toBe(400)
    expect((await post({ task: "hola" })).status).toBe(400)
    expect(requirePayment).not.toHaveBeenCalled()
  })

  it("returns the payment challenge unchanged when unpaid", async () => {
    requirePayment.mockResolvedValue({ ok: false, response: new Response("{}", { status: 402 }) })
    const res = await post({ task: "hola", agent })
    expect(res.status).toBe(402)
    expect(generate).not.toHaveBeenCalled()
  })

  it("keeps the receipt when the model fails after payment", async () => {
    generate.mockRejectedValue(new Error("OpenRouter rejected the request (HTTP 402)."))
    const res = await post({ task: "hola", agent: { connection: agent.connection } })
    const data = await res.json()
    expect(res.status).toBe(502)
    expect(data).toMatchObject({ ok: false, error: "OpenRouter rejected the request (HTTP 402).", receipt: { transaction: "settle-sig" } })
  })

  it("rejects login-based connections when OpenRouter is not connected", async () => {
    const res = await POST(new Request("https://agentic-city.test/api/x402/agents/a/task", {
      method: "POST", headers: { origin: "https://agentic-city.test" },
      body: JSON.stringify({ task: "hola", agent: { connection: { provider: "openrouter", model: "m", apiKey: "", auth: "oauth" } } }),
    }), { params: Promise.resolve({ id: "a" }) })
    expect(res.status).toBe(401)
    expect(requirePayment).not.toHaveBeenCalled()
  })

  describe("hosted tasks (hired from an MCP client)", () => {
    const env = { ...process.env }
    beforeEach(() => {
      process.env.BETTER_AUTH_SECRET = "hosted-task-secret"
      process.env.AI_GATEWAY_API_KEY = "gw-key-12345678"
      delete process.env.MCP_AGENT_API_KEY
      delete process.env.MCP_AGENT_MODEL
      delete process.env.MCP_AGENT_PROVIDER
    })
    afterEach(() => {
      process.env = { ...env }
    })

    function hosted(body: unknown, header: string | null, id = "researcher") {
      const headers: Record<string, string> = { "content-type": "application/json" }
      if (header) headers[HOSTED_HEADER] = header
      return POST(new Request(`https://agentic-city.test/api/x402/agents/${id}/task`, { method: "POST", headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
    }

    it("runs on the server's hosted model when signed by this server, binding the payment to the owner", async () => {
      setKvStoreForTests(createMemoryStore())
      try {
        const header = signHostedTask({ agentId: "researcher", task: "hola", ownerTag: "0123456789abcdef0123" })
        const res = await hosted({ task: "hola", agent: { name: "Investigadora", role: "Research", hosted: true } }, header)
        expect(res.status).toBe(200)
        expect(generate.mock.calls[0][0]).toEqual({ provider: "vercel-ai-gateway", model: "openai/gpt-4o-mini", apiKey: "gw-key-12345678" })
        expect(await getPaymentAgent("settle-sig")).toBe("0123456789abcdef0123/researcher")
      } finally {
        setKvStoreForTests(null)
      }
    })

    it("refuses unsigned or mismatched hosted tasks before charging", async () => {
      expect((await hosted({ task: "hola", agent: { hosted: true } }, null)).status).toBe(403)
      const forOther = signHostedTask({ agentId: "writer", task: "hola", ownerTag: null })
      expect((await hosted({ task: "hola", agent: { hosted: true } }, forOther)).status).toBe(403)
      delete process.env.AI_GATEWAY_API_KEY
      const ok = signHostedTask({ agentId: "researcher", task: "hola", ownerTag: null })
      expect((await hosted({ task: "hola", agent: { hosted: true } }, ok)).status).toBe(503)
      expect(requirePayment).not.toHaveBeenCalled()
    })
  })
})
