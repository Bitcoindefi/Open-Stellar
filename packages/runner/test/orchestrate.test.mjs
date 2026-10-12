import { describe, expect, it } from "vitest"
import { orchestrate, pickOrchestrator, runPool } from "../src/orchestrate.mjs"

/** A fake runAgent: answers planning, subtasks and synthesis from a script per agent. */
function fakeAgents({ plan, fail = {}, delayMs = 5, synthesisFails = false } = {}) {
  const calls = []
  let inFlight = 0
  let maxInFlight = 0
  const runAgent = async (agentId, prompt, { onChunk } = {}) => {
    calls.push({ agentId, prompt })
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    inFlight -= 1
    if (prompt.includes("Reply with ONLY a JSON array")) return { ok: true, text: plan }
    if (prompt.includes("Your team worked on the task below")) {
      if (synthesisFails) return { ok: false, text: "", error: "synthesis boom" }
      onChunk?.("final ")
      onChunk?.("answer")
      return { ok: true, text: "final answer" }
    }
    if (fail[agentId]) return { ok: false, text: "", error: fail[agentId] }
    onChunk?.(`${agentId} chunk`)
    return { ok: true, text: `${agentId} result` }
  }
  return { runAgent, calls, maxInFlight: () => maxInFlight }
}

async function collect(options) {
  const events = []
  const result = await orchestrate({ emit: (event) => events.push(event), ...options })
  return { events, result, types: events.map((event) => event.type) }
}

describe("pickOrchestrator", () => {
  it("prefers the requested agent, then Claude Code, then the first available", () => {
    expect(pickOrchestrator("codex", ["claude", "codex"])).toBe("codex")
    expect(pickOrchestrator("gemini", ["claude", "codex"])).toBe("claude")
    expect(pickOrchestrator(undefined, ["codex", "gemini"])).toBe("codex")
    expect(pickOrchestrator(undefined, [])).toBeNull()
  })
})

describe("runPool", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let active = 0
    let peak = 0
    const results = await runPool([30, 5, 20, 1, 10], 2, async (ms, index) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, ms))
      active -= 1
      return index
    })
    expect(results).toEqual([0, 1, 2, 3, 4])
    expect(peak).toBe(2)
    expect(await runPool([], 2, async () => 1)).toEqual([])
  })
})

describe("orchestrate", () => {
  const available = ["claude", "codex", "gemini", "ollama"]

  it("plans, runs the steps two at a time and synthesizes", async () => {
    const plan = JSON.stringify([
      { agent: "codex", subtask: "write code" },
      { agent: "gemini", subtask: "review" },
      { agent: "ollama", subtask: "summarize" },
    ])
    const agents = fakeAgents({ plan })
    const { events, result, types } = await collect({ task: "Build it", available, runAgent: agents.runAgent })
    expect(result).toEqual({ ok: true, text: "final answer" })
    expect(types[0]).toBe("start")
    expect(types[1]).toBe("planning")
    expect(events[1]).toMatchObject({ agent: "claude", label: "Claude Code" })
    expect(events[2]).toMatchObject({ type: "plan", fallback: false, steps: [{ agent: "codex", label: "Codex CLI" }, { agent: "gemini" }, { agent: "ollama" }] })
    expect(types.filter((type) => type === "step_start")).toHaveLength(3)
    expect(types.filter((type) => type === "step_done")).toHaveLength(3)
    expect(events.find((event) => event.type === "chunk" && event.phase === "step")).toMatchObject({ index: expect.any(Number) })
    expect(types.slice(-4)).toEqual(["chunk", "chunk", "final", "done"])
    expect(events.at(-2)).toMatchObject({ type: "final", agent: "claude", synthesized: true, text: "final answer" })
    expect(agents.maxInFlight()).toBeLessThanOrEqual(2)
    expect(agents.calls[1].prompt).toContain("Overall task (for context): Build it")
  })

  it("falls back to the orchestrator alone when the plan is not valid JSON", async () => {
    const agents = fakeAgents({ plan: "Let Codex do it." })
    const { events, types } = await collect({ task: "Hacé X", available: ["codex", "gemini"], runAgent: agents.runAgent })
    expect(events.find((event) => event.type === "plan_fallback")).toMatchObject({ agent: "codex" })
    expect(events.find((event) => event.type === "plan")).toMatchObject({ fallback: true, steps: [{ agent: "codex", subtask: "Hacé X" }] })
    // The whole task goes as-is to the orchestrator and its answer is final (no synthesis call).
    expect(agents.calls.map((call) => call.prompt)).toEqual([expect.stringContaining("JSON array"), "Hacé X"])
    expect(types).not.toContain("synthesizing")
    expect(events.find((event) => event.type === "final")).toMatchObject({ synthesized: false, text: "codex result" })
  })

  it("skips synthesis when the plan has a single step", async () => {
    const agents = fakeAgents({ plan: '[{"agent":"gemini","subtask":"only"}]' })
    const { events, types } = await collect({ task: "t", available, runAgent: agents.runAgent, orchestrator: "codex" })
    expect(events[1]).toMatchObject({ type: "planning", agent: "codex" })
    expect(types).not.toContain("synthesizing")
    expect(events.find((event) => event.type === "final")).toMatchObject({ agent: "gemini", text: "gemini result", synthesized: false })
  })

  it("only uses the requested agents that are available", async () => {
    const agents = fakeAgents({ plan: '[{"agent":"claude","subtask":"x"},{"agent":"codex","subtask":"y"}]' })
    const { events } = await collect({ task: "t", agents: ["codex", "gemini", "codex"], available: ["claude", "codex"], runAgent: agents.runAgent })
    expect(events[0]).toMatchObject({ type: "start", agents: ["codex"], orchestrator: "claude" })
    expect(events.find((event) => event.type === "plan").steps).toEqual([{ agent: "codex", subtask: "y", label: "Codex CLI" }])
  })

  it("reports step failures and still synthesizes from the rest", async () => {
    const agents = fakeAgents({ plan: '[{"agent":"codex","subtask":"a"},{"agent":"gemini","subtask":"b"}]', fail: { gemini: "Gemini CLI no tiene sesión iniciada" } })
    const { events } = await collect({ task: "t", available, runAgent: agents.runAgent })
    expect(events.find((event) => event.type === "step_error")).toMatchObject({ agent: "gemini", error: expect.stringContaining("sesión") })
    expect(events.find((event) => event.type === "final")).toMatchObject({ synthesized: true })
    expect(agents.calls.at(-1).prompt).toContain("(failed: Gemini CLI no tiene sesión iniciada)")
  })

  it("errors when every step fails", async () => {
    const agents = fakeAgents({ plan: '[{"agent":"codex","subtask":"a"}]', fail: { codex: "boom" } })
    const { result, events } = await collect({ task: "t", available, runAgent: agents.runAgent })
    expect(result.ok).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: "error", message: expect.stringContaining("Ningún agente") })
  })

  it("hands back the raw results when the synthesis fails", async () => {
    const agents = fakeAgents({ plan: '[{"agent":"codex","subtask":"a"},{"agent":"gemini","subtask":"b"}]', synthesisFails: true })
    const { events, result } = await collect({ task: "t", available, runAgent: agents.runAgent })
    expect(result.ok).toBe(true)
    expect(events.find((event) => event.type === "final")).toMatchObject({ synthesized: false, note: "synthesis boom", text: expect.stringContaining("## Codex CLI\ncodex result") })
  })

  it("errors without agents or when the planner itself fails", async () => {
    const none = await collect({ task: "t", available: [], runAgent: async () => ({ ok: true, text: "" }) })
    expect(none.events).toEqual([{ type: "error", message: expect.stringContaining("No hay agentes") }])
    const broken = await collect({ task: "t", available: ["claude"], runAgent: async () => ({ ok: false, text: "", error: "Claude Code no tiene sesión iniciada" }) })
    expect(broken.events.at(-1)).toMatchObject({ type: "error", agent: "claude", message: expect.stringContaining("sesión") })
    const silent = await collect({ task: "t", available: ["claude"], runAgent: async () => ({ ok: false, text: "" }) })
    expect(silent.events.at(-1)).toMatchObject({ type: "error", message: "Claude Code no pudo planificar." })
  })

  it("stops quietly when the client goes away", async () => {
    const controller = new AbortController()
    const agents = fakeAgents({ plan: '[{"agent":"codex","subtask":"a"},{"agent":"gemini","subtask":"b"},{"agent":"ollama","subtask":"c"}]', delayMs: 20 })
    const pending = collect({ task: "t", available, runAgent: agents.runAgent, signal: controller.signal })
    setTimeout(() => controller.abort(), 30)
    const { result, types } = await pending
    expect(result.ok).toBe(false)
    expect(types).not.toContain("final")
  })
})
