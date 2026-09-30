import { beforeEach, describe, expect, it, vi } from "vitest"

const generate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/ai/byok-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/byok-provider")>()
  return { ...actual, generateWithByokProvider: generate }
})
vi.mock("@/lib/ai/jev", () => ({ isJevModel: (model: string) => model === "typesafe-ai/jev" }))

import { POST } from "@/app/api/connections/chat/route"
import { POST as testRelay } from "@/app/api/connections/test/route"
import { POST as runRelay } from "@/app/api/connections/run/route"

const connection = { provider: "openrouter", model: "anthropic/claude-opus-5", apiKey: "or-test-key-1234" }
const members = [
  { id: "research", name: "Investigador", role: "Relevar opciones", connection },
  { id: "critic", name: "Crítico", role: "Buscar riesgos", connection: { ...connection, model: "x-ai/grok-4" } },
]

function post(body: unknown) {
  return POST(new Request("https://agentic-city.test/api/connections/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))
}

describe("POST /api/connections/chat", () => {
  beforeEach(() => {
    generate.mockReset()
    generate.mockImplementation(async (conn: { model: string }) => `respuesta de ${conn.model}`)
  })

  it("routes a message to the orchestrator and never echoes the key", async () => {
    const res = await post({ message: "Hola", orchestrator: { name: "Supervisor", connection }, members })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.responses).toEqual([expect.objectContaining({ id: "orchestrator", name: "Supervisor", message: "respuesta de anthropic/claude-opus-5" })])
    expect(JSON.stringify(data)).not.toContain("or-test-key-1234")
    const [, system, prompt] = generate.mock.calls[0]
    expect(system).toContain("You are Supervisor")
    expect(JSON.parse(prompt).context).toContain("Investigador: Relevar opciones")
  })

  it("routes a message to one team member", async () => {
    const res = await post({ message: "¿Riesgos?", target: "member:critic", orchestrator: { connection }, members })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.responses).toHaveLength(1)
    expect(data.responses[0]).toMatchObject({ id: "critic", model: "x-ai/grok-4" })
  })

  it("rejects an unknown member", async () => {
    const res = await post({ message: "Hola", target: "member:ghost", orchestrator: { connection }, members })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("not in the saved team")
  })

  it("lets the whole team answer after the orchestrator note, with trimmed history", async () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ speaker: "user", message: `m${i}` }))
    const res = await post({ message: "Plan", target: "team", orchestrator: { connection }, members, history: [...history, { bad: true }], context: "demo" })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.responses.map((r: { id: string }) => r.id)).toEqual(["orchestrator", "research", "critic"])
    const workerPrompt = JSON.parse(generate.mock.calls[1][2])
    expect(workerPrompt.conversation.at(-1)).toEqual({ speaker: "Orchestrator", message: "respuesta de anthropic/claude-opus-5" })
    expect(workerPrompt.conversation.length).toBeLessThanOrEqual(13)
  })

  it("rejects unsupported targets", async () => {
    const res = await post({ message: "Hola", target: "everyone", orchestrator: { connection }, members })
    expect(res.status).toBe(400)
  })

  it("validates message, orchestrator and members", async () => {
    expect((await post({ message: "" })).status).toBe(400)
    expect((await post({ message: "x".repeat(3001), orchestrator: { connection }, members })).status).toBe(400)
    expect((await post({ message: "Hola", members })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection: { ...connection, apiKey: "short" } }, members })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection: { ...connection, provider: "vercel-ai-gateway", model: "typesafe-ai/jev" } }, members })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection }, members: [] })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection }, members: [{ id: 1 }] })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection }, members: [null] })).status).toBe(400)
    expect(generate).not.toHaveBeenCalled()
  })

  it("returns 502 with the provider error", async () => {
    generate.mockRejectedValueOnce(new Error("OpenRouter rejected the request (HTTP 402)."))
    const res = await post({ message: "Hola", orchestrator: { connection }, members })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe("OpenRouter rejected the request (HTTP 402).")
  })

  it("handles a non-JSON body", async () => {
    const res = await POST(new Request("https://agentic-city.test/api/connections/chat", { method: "POST", body: "not json" }))
    expect(res.status).toBe(400)
  })
})

describe("public BYOK relays", () => {
  it("validate requests the same way as the admin connection routes", async () => {
    const empty = () => new Request("https://agentic-city.test/api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    const test = await testRelay(empty())
    const run = await runRelay(empty())
    expect(test.status).toBe(400)
    expect(run.status).toBe(400)
    expect(generate).not.toHaveBeenCalled()
  })
})
