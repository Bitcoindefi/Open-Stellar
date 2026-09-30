import { beforeEach, describe, expect, it, vi } from "vitest"

const isAuthorized = vi.hoisted(() => vi.fn())
const verifyApiKey = vi.hoisted(() => vi.fn())
const generate = vi.hoisted(() => vi.fn())
const summarizeTaskWithJev = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ isAuthorized }))
vi.mock("@/lib/auth/api-keys", () => ({ verifyApiKey }))
vi.mock("@/lib/ai/jev", () => ({ isJevModel: (model: string) => model === "typesafe-ai/jev", summarizeTaskWithJev }))
vi.mock("@/lib/ai/byok-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/byok-provider")>()
  return { ...actual, generateWithByokProvider: generate }
})

import { GET, POST } from "@/app/agent-functions/[id]/route"
import { provisionCloudAgent } from "@/lib/agent-runtime/cloud-agents"

let counter = 0
function freshAgent(overrides: Parameters<typeof provisionCloudAgent>[0] = {}) {
  counter += 1
  return provisionCloudAgent({ name: `route-test-${counter}`, ...overrides })
}

function post(id: string, body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`https://agentic-city.test/agent-functions/${id}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  )
}

describe("/agent-functions/[id]", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    isAuthorized.mockReset().mockReturnValue(false)
    verifyApiKey.mockReset().mockResolvedValue({ valid: false, isAdmin: false, scopes: [] })
    generate.mockReset().mockResolvedValue("hecho")
    summarizeTaskWithJev.mockReset().mockResolvedValue("resumen jev")
    delete process.env.ANTHROPIC_API_KEY
  })

  it("rejects callers without a gateway token or an agents:write key", async () => {
    const agent = freshAgent()
    expect((await post(agent.id, { task: "x" })).status).toBe(401)
    expect((await post(agent.id, { task: "x" }, { authorization: "Bearer osk_live_readonly" })).status).toBe(401)
    expect(verifyApiKey).toHaveBeenCalledWith("osk_live_readonly")
  })

  it("accepts service keys with agents:write and asks for a model key when none is available", async () => {
    verifyApiKey.mockResolvedValue({ valid: true, isAdmin: false, scopes: ["agents:write"] })
    const agent = freshAgent()
    const res = await post(agent.id, { task: "  ordenar la cola  ", taskId: "t-1" }, { "x-api-key": "osk_live_writer" })
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data).toMatchObject({ ok: false, agentId: agent.id, taskId: "t-1" })
    expect(data.error).toContain("x-ai-api-key")
    expect(generate).not.toHaveBeenCalled()
  })

  it("runs the task with the caller's provider key", async () => {
    isAuthorized.mockReturnValue(true)
    const agent = freshAgent()
    const res = await post(agent.id, { prompt: "resumí" }, { "x-ai-provider": "OpenRouter", "x-ai-model": "x-ai/grok-4", "x-ai-api-key": "or-key-123456" })

    expect(res.status).toBe(200)
    expect((await res.json()).result.summary).toBe("hecho")
    expect(generate.mock.calls[0][0]).toEqual({ provider: "openrouter", model: "x-ai/grok-4", apiKey: "or-key-123456" })
  })

  it("uses the server Anthropic key for Anthropic agents", async () => {
    isAuthorized.mockReturnValue(true)
    process.env.ANTHROPIC_API_KEY = "server-anthropic-key"
    const agent = freshAgent({ provider: "anthropic", model: "claude-opus-5" })
    await post(agent.id, { title: "t" })
    expect(generate.mock.calls[0][0]).toMatchObject({ provider: "anthropic", apiKey: "server-anthropic-key" })
    process.env.ANTHROPIC_API_KEY = originalKey
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
  })

  it("routes JEV models through the gateway evaluator", async () => {
    isAuthorized.mockReturnValue(true)
    const agent = freshAgent({ model: "typesafe-ai/jev" })
    const res = await post(agent.id, { task: "evaluar" }, { "x-ai-gateway-key": "gw-key-123456" })
    expect((await res.json()).result.summary).toBe("resumen jev")
    expect(summarizeTaskWithJev).toHaveBeenCalledWith("evaluar", { apiKey: "gw-key-123456" })
  })

  it("reports unsupported providers and missing keys as failed runs", async () => {
    isAuthorized.mockReturnValue(true)
    const agent = freshAgent()
    const bad = await post(agent.id, { task: "x" }, { "x-ai-provider": "custom", "x-ai-api-key": "k-123456" })
    expect(bad.status).toBe(500)
    expect((await bad.json()).error).toContain("Unsupported AI provider")

    const missing = await post(agent.id, { task: "x" }, { "x-ai-provider": "openai" })
    expect(missing.status).toBe(500)
    expect((await missing.json()).error).toContain("x-ai-api-key")
  })

  it("streams a heartbeat over SSE", async () => {
    const agent = freshAgent()
    const res = await GET(new Request(`https://agentic-city.test/agent-functions/${agent.id}`), { params: Promise.resolve({ id: agent.id }) })
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    expect(new TextDecoder().decode(value)).toContain("event: heartbeat")
    await reader.cancel()
  })
})
