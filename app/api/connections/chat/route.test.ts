import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LanguageModel } from "ai"
import { createMemoryStore } from "@/lib/security/kv-store"
import { createApprovalSigner } from "@/lib/orchestration/approval"
import type { ChatRunDeps } from "@/lib/orchestration/chat-run"
import { DEFAULT_HANDOFF_CAPS } from "@/lib/orchestration/handoff"
import type { ChatStreamEvent } from "@/lib/orchestration/events"
import { scriptedModel, textStep, toolStep } from "@/__tests__/helpers/mock-model"

const generate = vi.hoisted(() => vi.fn())
const depsState = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/lib/ai/byok-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/byok-provider")>()
  return { ...actual, generateWithByokProvider: generate }
})
vi.mock("@/lib/ai/jev", () => ({ isJevModel: (model: string) => model === "typesafe-ai/jev" }))
vi.mock("@/lib/orchestration/deps", () => ({ createChatRunDeps: vi.fn(async () => depsState.current) }))

import { POST } from "@/app/api/connections/chat/route"
import { POST as testRelay } from "@/app/api/connections/test/route"
import { POST as runRelay } from "@/app/api/connections/run/route"

const connection = { provider: "openrouter", model: "anthropic/claude-opus-5", apiKey: "or-test-key-1234" }
const members = [
  { id: "research", name: "Investigador", role: "Relevar opciones", connection },
  { id: "critic", name: "Crítico", role: "Buscar riesgos", connection: { ...connection, model: "x-ai/grok-4" } },
]
const approvals = createApprovalSigner(Buffer.alloc(32, 9))

function useModels(models: Record<string, LanguageModel>, overrides: Partial<ChatRunDeps> = {}) {
  const hire = vi.fn(async () => ({ ok: true as const, answer: "paid answer", receipt: { transaction: "Sig1", network: "solana:devnet", payer: "Orch", amount: "10000", asset: "USDC", explorerUrl: "https://explorer.solana.com/tx/Sig1?cluster=devnet" } }))
  const deps: ChatRunDeps = {
    modelFor: (conn) => models[conn.model],
    hire,
    store: createMemoryStore(),
    budget: { perRunMicro: 50_000, perDayMicro: 500_000, hardDayMicro: 2_000_000 },
    caps: DEFAULT_HANDOFF_CAPS,
    priceMicro: 10_000,
    approvals,
    newRunId: () => "run-1",
    ...overrides,
  }
  depsState.current = deps
  return { deps, hire }
}

function post(body: unknown) {
  return POST(new Request("https://agentic-city.test/api/connections/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))
}

async function events(res: Response): Promise<ChatStreamEvent[]> {
  return (await res.text()).trim().split("\n").map((line) => JSON.parse(line) as ChatStreamEvent)
}

describe("POST /api/connections/chat", () => {
  beforeEach(() => {
    generate.mockReset()
    depsState.current = null
  })

  it("streams the orchestrator's answer as NDJSON and never echoes the key", async () => {
    const model = scriptedModel([textStep("Hola ", "equipo")])
    useModels({ "anthropic/claude-opus-5": model })
    const res = await post({ message: "Hola", orchestrator: { name: "Supervisor", connection }, members })

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/x-ndjson")
    const text = await res.clone().text()
    expect(text).not.toContain("or-test-key-1234")
    const stream = await events(res)
    expect(stream[1]).toMatchObject({ type: "agent-start", agentId: "orchestrator", name: "Supervisor" })
    expect(stream.filter((event) => event.type === "text").map((event) => (event as { delta: string }).delta).join("")).toBe("Hola equipo")
    expect(stream.at(-1)).toMatchObject({ type: "done", runId: "run-1" })
  })

  it("lets the team talk: the orchestrator hires a member through a paid hop", async () => {
    const model = scriptedModel([toolStep([{ id: "c1", input: { agent: "research", task: "Find options" } }]), textStep("Synthesis")])
    const { hire } = useModels({ "anthropic/claude-opus-5": model })
    const stream = await events(await post({ message: "Plan", target: "team", orchestrator: { connection }, members, history: [{ speaker: "You", message: "hi" }, { bad: true }] }))

    expect(hire).toHaveBeenCalledWith(expect.objectContaining({ id: "research", connection: { provider: "openrouter", model: "anthropic/claude-opus-5", apiKey: "or-test-key-1234" } }), "Find options")
    expect(stream).toContainEqual(expect.objectContaining({ type: "handoff", fromName: "Orchestrator", toName: "Investigador", amount: "0.01" }))
    expect(stream).toContainEqual(expect.objectContaining({ type: "text", delta: "paid answer" }))
    expect(JSON.parse((model.doStreamCalls[0].prompt[1] as { content: Array<{ text: string }> }).content[0].text).conversation).toEqual([{ speaker: "You", message: "hi" }])
  })

  it("routes a message to one team member", async () => {
    useModels({ "x-ai/grok-4": scriptedModel([textStep("riesgos")]) })
    const stream = await events(await post({ message: "¿Riesgos?", target: "member:critic", orchestrator: { connection }, members }))
    expect(stream[1]).toMatchObject({ type: "agent-start", agentId: "critic", model: "x-ai/grok-4" })
  })

  it("resumes an approved hire with a signed token", async () => {
    const { hire } = useModels({})
    const { token } = approvals.issue({ runId: "run-9", fromId: "orchestrator", fromName: "Orchestrator", toId: "critic", toName: "Crítico", task: "Find risks", amountMicro: 10_000, reason: "run" })
    const stream = await events(await post({ approval: { token, runId: "run-9", decision: "approve" }, orchestrator: { connection }, members }))
    expect(hire).toHaveBeenCalledWith(expect.objectContaining({ id: "critic" }), "Find risks")
    expect(stream.at(-1)).toMatchObject({ type: "done", runId: "run-9", spent: "0.01" })
  })

  it("rejects a malformed approval before streaming", async () => {
    useModels({})
    for (const approval of [null, "x", { token: "t", runId: "r", decision: "maybe" }, { token: 1, runId: "r", decision: "approve" }]) {
      const res = await post({ approval, orchestrator: { connection }, members })
      expect(res.status).toBe(400)
    }
  })

  it("rejects an unknown member and unsupported targets", async () => {
    useModels({})
    const unknown = await post({ message: "Hola", target: "member:ghost", orchestrator: { connection }, members })
    expect(unknown.status).toBe(400)
    expect((await unknown.json()).error).toContain("not in the saved team")
    expect((await post({ message: "Hola", target: "everyone", orchestrator: { connection }, members })).status).toBe(400)
  })

  it("validates message, orchestrator and members", async () => {
    useModels({})
    expect((await post({ message: "" })).status).toBe(400)
    expect((await post({ message: "x".repeat(3001), orchestrator: { connection }, members })).status).toBe(400)
    expect((await post({ message: "Hola", members })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection: { ...connection, apiKey: "short" } }, members })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection: { ...connection, provider: "vercel-ai-gateway", model: "typesafe-ai/jev" } }, members })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection }, members: [] })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection }, members: [{ id: 1 }] })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection }, members: [null] })).status).toBe(400)
    expect((await post({ message: "Hola", orchestrator: { connection }, members: [{ ...members[0], id: "  " }] })).status).toBe(400)
  })

  it("streams the provider error as an event", async () => {
    useModels({ "anthropic/claude-opus-5": scriptedModel([]) })
    const stream = await events(await post({ message: "Hola", orchestrator: { connection }, members }))
    expect(stream.some((event) => event.type === "error")).toBe(true)
    expect(stream.at(-1)?.type).toBe("done")
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
