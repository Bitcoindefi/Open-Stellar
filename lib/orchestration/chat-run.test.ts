import { describe, expect, it, vi } from "vitest"
import type { LanguageModel } from "ai"
import { createMemoryStore, type KvStore } from "@/lib/security/kv-store"
import { createApprovalSigner } from "@/lib/orchestration/approval"
import { runChat, type ChatRunDeps, type ChatRunInput } from "@/lib/orchestration/chat-run"
import type { ChatStreamEvent } from "@/lib/orchestration/events"
import { DEFAULT_HANDOFF_CAPS, type RosterAgent } from "@/lib/orchestration/handoff"
import type { HopResult } from "@/lib/orchestration/wallet"
import { errorStep, scriptedModel, textStep, toolStep } from "@/__tests__/helpers/mock-model"

const connection = { provider: "openrouter" as const, model: "anthropic/claude", apiKey: "or-test-key-1234" }
const orchestrator: RosterAgent = { id: "orchestrator", name: "Supervisor", role: "Coordinate", connection }
const members: RosterAgent[] = [
  { id: "research", name: "Investigador", role: "Relevar opciones", connection: { ...connection, model: "research-model" } },
  { id: "critic", name: "Critico", role: "Buscar riesgos", connection: { ...connection, model: "critic-model" } },
]
const day = new Date("2026-10-01T12:00:00Z")
const key = Buffer.alloc(32, 5)
const OWNER = "e".repeat(32)
const WALLET = "AgentWa11et1111111111111111111111111111111"

function receipt(n: number) {
  return { transaction: `Sig${n}`, network: "solana:devnet", payer: "Orch", amount: "10000", asset: "USDC", explorerUrl: `https://explorer.solana.com/tx/Sig${n}?cluster=devnet` }
}

function setup(models: Record<string, LanguageModel>, overrides: Partial<ChatRunDeps> = {}) {
  let paid = 0
  const hire = vi.fn(async (agent: RosterAgent): Promise<HopResult> => ({ ok: true, answer: `${agent.name} says hi`, receipt: receipt(++paid) }))
  const store = createMemoryStore()
  const deps: ChatRunDeps = {
    modelFor: (conn) => models[conn.model],
    hire,
    owner: OWNER,
    wallet: { address: WALLET },
    store,
    budget: { perRunMicro: 50_000, perDayMicro: 500_000, hardDayMicro: 2_000_000 },
    caps: DEFAULT_HANDOFF_CAPS,
    priceMicro: 10_000,
    approvals: createApprovalSigner(key),
    now: () => day,
    newRunId: () => "run-1",
    ...overrides,
  }
  return { deps, hire, store }
}

function input(overrides: Partial<ChatRunInput> = {}): ChatRunInput {
  return { message: "Plan the launch", target: "team", context: "demo", history: [], orchestrator, members, ...overrides }
}

async function collect(chatInput: ChatRunInput, deps: ChatRunDeps) {
  const events: ChatStreamEvent[] = []
  await runChat(chatInput, deps, (event) => events.push(event))
  return events
}

describe("runChat", () => {
  it("lets the orchestrator hire teammates, then synthesize, all as one stream", async () => {
    const orchestratorModel = scriptedModel([
      toolStep([{ id: "c1", input: { agent: "research", task: "Find options" } }, { id: "c2", input: { agent: "Critico", task: "Find risks" } }], "Hiring two. "),
      textStep("Summary: ", "go."),
    ])
    const { deps, hire } = setup({ "anthropic/claude": orchestratorModel })
    const events = await collect(input(), deps)

    expect(hire).toHaveBeenCalledTimes(2)
    expect(events[0]).toEqual({ type: "run", runId: "run-1", hiring: true, perRunUsdc: "0.05", perDayUsdc: "0.5", wallet: WALLET })
    expect(events.filter((event) => event.type === "handoff").map((event) => (event as { toName: string }).toName)).toEqual(["Investigador", "Critico"])
    expect(events.filter((event) => event.type === "tool")).toEqual([
      { type: "tool", turnId: "orchestrator-1", callId: "c1", status: "running", label: "Hiring research", detail: "Find options" },
      { type: "tool", turnId: "orchestrator-1", callId: "c2", status: "running", label: "Hiring Critico", detail: "Find risks" },
      { type: "tool", turnId: "orchestrator-1", callId: "c1", status: "done", label: "Hired Investigador, paid 0.01 USDC", detail: "Sig1" },
      { type: "tool", turnId: "orchestrator-1", callId: "c2", status: "done", label: "Hired Critico, paid 0.01 USDC", detail: "Sig2" },
    ])
    const text = events.filter((event) => event.type === "text" && event.turnId === "orchestrator-1").map((event) => (event as { delta: string }).delta).join("")
    expect(text).toBe("Hiring two. Summary: go.")
    expect(events.at(-1)).toEqual({ type: "done", runId: "run-1", spent: "0.02", receipts: [receipt(1), receipt(2)] })

    const system = (orchestratorModel.doStreamCalls[0].prompt[0] as { content: string }).content
    expect(system).toContain("hire each of them once")
    expect(system).toContain("Investigador (id research)")
    expect(orchestratorModel.doStreamCalls[0].tools?.map((item) => item.name)).toEqual(["message_agent"])
  })

  it("routes to the orchestrator, which answers directly", async () => {
    const model = scriptedModel([textStep("Hola")])
    const { deps } = setup({ "anthropic/claude": model })
    const events = await collect(input({ target: "orchestrator" }), deps)
    expect(events.map((event) => event.type)).toEqual(["run", "agent-start", "text", "agent-end", "done"])
    expect((model.doStreamCalls[0].prompt[0] as { content: string }).content).toContain("Answer directly when you can")
    expect(JSON.parse((model.doStreamCalls[0].prompt[1] as { content: Array<{ text: string }> }).content[0].text)).toEqual({ context: "demo", conversation: [], latestUserMessage: "Plan the launch" })
  })

  it("routes to one member, who can hire the others but not itself", async () => {
    const model = scriptedModel([textStep("Riesgos: pocos")])
    const { deps } = setup({ "critic-model": model })
    const events = await collect(input({ target: "member:critic" }), deps)
    expect(events[1]).toMatchObject({ type: "agent-start", agentId: "critic", name: "Critico", model: "critic-model" })
    const system = (model.doStreamCalls[0].prompt[0] as { content: string }).content
    expect(system).toContain("Investigador (id research)")
    expect(system).not.toContain("Critico (id critic)")
  })

  it("reports an unknown member as an error event", async () => {
    const { deps } = setup({})
    const events = await collect(input({ target: "member:ghost" }), deps)
    expect(events).toContainEqual({ type: "error", message: "Selected agent is not in the saved team." })
    expect(events.at(-1)?.type).toBe("done")
  })

  it("asks for funds in the chat when the agents' wallet is empty, then keeps going", async () => {
    const model = scriptedModel([toolStep([{ id: "c1", input: { agent: "research", task: "Find options" } }]), textStep("Fund your wallet and ask again.")])
    const hire = vi.fn(async (): Promise<HopResult> => ({ ok: false, code: "unfunded", balanceMicro: 0, error: "not enough" }))
    const { deps } = setup({ "anthropic/claude": model }, { hire })
    const events = await collect(input(), deps)
    expect(events).toContainEqual({ type: "wallet", status: "unfunded", address: WALLET, balanceUsdc: "0", neededUsdc: "0.01" })
    expect(events).toContainEqual(expect.objectContaining({ type: "tool", callId: "c1", status: "refused", detail: expect.stringContaining("Fund button") }))
    expect(events.at(-1)).toMatchObject({ type: "done", spent: "0", receipts: [] })
  })

  it("tells the agents that hiring is off when there is no wallet, and offers no tool", async () => {
    const model = scriptedModel([textStep("I will do it myself")])
    const { deps } = setup({ "anthropic/claude": model }, { hire: null, wallet: null })
    const events = await collect(input(), deps)
    expect(events[0]).toMatchObject({ hiring: false, wallet: null })
    expect((model.doStreamCalls[0].prompt[0] as { content: string }).content).toContain("Hiring them is not available right now")
  })

  it("ends the turn and shows an approval when a hire would cross the cap", async () => {
    const model = scriptedModel([toolStep([{ id: "c1", input: { agent: "research", task: "Find options" } }]), textStep("never")])
    const { deps, hire } = setup({ "anthropic/claude": model }, { budget: { perRunMicro: 0, perDayMicro: 500_000, hardDayMicro: 2_000_000 } })
    const events = await collect(input(), deps)

    expect(hire).not.toHaveBeenCalled()
    expect(model.doStreamCalls).toHaveLength(1)
    expect(events).toContainEqual(expect.objectContaining({ type: "approval", runId: "run-1", toName: "Investigador", reason: "run" }))
    expect(events).toContainEqual({ type: "tool", turnId: "orchestrator-1", callId: "c1", status: "approval", label: "Waiting for your approval to hire Investigador" })
  })

  it("shows a refused hire and a failed tool call as readable lines", async () => {
    const model = scriptedModel([
      toolStep([{ id: "c1", input: { agent: "ghost", task: "x" } }, { id: "c2", input: { agent: "research" } }]),
      textStep("ok"),
    ])
    const { deps } = setup({ "anthropic/claude": model })
    const events = await collect(input(), deps)
    expect(events).toContainEqual({ type: "tool", turnId: "orchestrator-1", callId: "c1", status: "refused", label: "Hire not made", detail: 'There is no agent called "ghost" on this team.' })
    expect(events).toContainEqual(expect.objectContaining({ type: "tool", callId: "c2", status: "failed", label: "Hiring an agent" }))
  })

  it("marks a hire that was paid but could not finish as failed, keeping the receipt", async () => {
    const model = scriptedModel([toolStep([{ id: "c1", input: { agent: "research", task: "x" } }]), textStep("ok")])
    const { deps } = setup({ "anthropic/claude": model }, { hire: vi.fn(async (): Promise<HopResult> => ({ ok: false, error: "OpenRouter rejected the request (HTTP 401).", receipt: receipt(7) })) })
    const events = await collect(input(), deps)
    expect(events).toContainEqual(expect.objectContaining({ type: "tool", callId: "c1", status: "failed", label: "Investigador was paid 0.01 USDC" }))
    expect(events.at(-1)).toMatchObject({ type: "done", spent: "0.01", receipts: [receipt(7)] })
  })

  it("streams provider errors as an error event and still finishes", async () => {
    const { deps } = setup({ "anthropic/claude": scriptedModel([errorStep({ statusCode: 402 })]) })
    const events = await collect(input({ target: "orchestrator" }), deps)
    expect(events).toContainEqual({ type: "error", message: "OpenRouter rejected the request (HTTP 402)." })
    expect(events.slice(-3).map((event) => event.type)).toEqual(["agent-end", "error", "done"])
  })
})

describe("runChat approval resume", () => {
  const signer = createApprovalSigner(key)
  const issue = (runId = "run-1", owner = OWNER) => signer.issue({ runId, owner, fromId: "orchestrator", fromName: "Supervisor", toId: "research", toName: "Investigador", task: "Find options", amountMicro: 10_000, reason: "run" }, day.getTime())

  it("pays the approved hire once", async () => {
    const { deps, hire } = setup({})
    const { token } = issue()
    const events = await collect(input({ message: "", approval: { token, runId: "run-1", decision: "approve" } }), deps)
    expect(hire).toHaveBeenCalledWith(members[0], "Find options")
    expect(events).toContainEqual({ type: "notice", message: "Approved. Supervisor is hiring Investigador for 0.01 USDC." })
    expect(events).toContainEqual(expect.objectContaining({ type: "handoff", toName: "Investigador" }))
    expect(events.at(-1)).toMatchObject({ type: "done", runId: "run-1", spent: "0.01" })

    const replay = await collect(input({ message: "", approval: { token, runId: "run-1", decision: "approve" } }), deps)
    expect(replay).toContainEqual({ type: "error", message: "This approval was already used." })
    expect(hire).toHaveBeenCalledTimes(1)
  })

  it("records a rejection and pays nothing", async () => {
    const { deps, hire } = setup({})
    const events = await collect(input({ message: "", approval: { token: issue().token, runId: "run-1", decision: "reject" } }), deps)
    expect(events).toContainEqual({ type: "notice", message: "You declined. Supervisor did not hire Investigador and nothing was paid." })
    expect(hire).not.toHaveBeenCalled()
  })

  it("refuses a token for another run, a forged one, and works only with approvals configured", async () => {
    const { deps } = setup({})
    const other = await collect(input({ message: "", approval: { token: issue("run-2").token, runId: "run-1", decision: "approve" } }), deps)
    expect(other).toContainEqual({ type: "error", message: "This approval belongs to a different conversation run." })
    const stranger = await collect(input({ message: "", approval: { token: issue("run-1", "f".repeat(32)).token, runId: "run-1", decision: "approve" } }), deps)
    expect(stranger).toContainEqual({ type: "error", message: "This approval belongs to another browser." })
    const forged = await collect(input({ message: "", approval: { token: "abc.def", runId: "run-1", decision: "approve" } }), deps)
    expect(forged).toContainEqual({ type: "error", message: "This approval is not valid." })
    const none = setup({}, { approvals: null })
    expect(await collect(input({ message: "", approval: { token: issue().token, runId: "run-1", decision: "approve" } }), none.deps)).toContainEqual({ type: "error", message: "Approvals are not available on this server." })
  })

  it("reports an approved hire that could not be paid, and a store that is down", async () => {
    const failing = setup({}, { hire: vi.fn(async (): Promise<HopResult> => ({ ok: false, error: "facilitator down" })) })
    const events = await collect(input({ message: "", approval: { token: issue().token, runId: "run-1", decision: "approve" } }), failing.deps)
    expect(events).toContainEqual({ type: "notice", message: expect.stringContaining("facilitator down") })

    const broken: KvStore = { ...createMemoryStore(), set: async () => { throw new Error("down") } }
    const down = setup({}, { store: broken })
    expect(await collect(input({ message: "", approval: { token: issue().token, runId: "run-1", decision: "approve" } }), down.deps))
      .toContainEqual({ type: "error", message: "The approval could not be recorded just now, so nothing was paid. Try again." })
  })
})
