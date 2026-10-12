import { describe, expect, it } from "vitest"
import { looksLikeSignature, type ChatStreamEvent } from "@/lib/orchestration/events"
import { applyChatEvent, createTranscriptContext, type TranscriptItem } from "@/lib/orchestration/transcript"
import type { RunnerAgent } from "@/lib/runner/client"
import {
  RUNNER_TEAM_TARGET,
  agentChip,
  createRunnerEventMapper,
  isRunnerTarget,
  runnerAgentLabel,
  runnerRequestFor,
  runnerTargetOptions,
  usableRunnerAgents,
  type RunnerEvent,
} from "@/lib/runner/events"

const agent = (overrides: Partial<RunnerAgent>): RunnerAgent => ({ id: "claude", label: "Claude Code", installed: true, version: "1", loggedIn: true, ...overrides })

/** Feeds runner events through the mapper and the real transcript reducer. */
function transcriptOf(mode: "run" | "orchestrate", events: RunnerEvent[], finish = false) {
  let n = 0
  const ctx = createTranscriptContext({ makeId: () => `id-${++n}`, timeLabel: () => "12:00", friendlyError: (message) => message })
  const mapper = createRunnerEventMapper("r1", mode)
  let items: TranscriptItem[] = []
  const chat: ChatStreamEvent[] = []
  for (const event of events) {
    for (const mapped of mapper.map(event)) {
      chat.push(mapped)
      items = applyChatEvent(items, mapped, ctx)
    }
  }
  if (finish) for (const mapped of mapper.finish()) items = applyChatEvent(items, mapped, ctx)
  return { items, chat }
}

describe("agent chips", () => {
  it("says conectado / no logueado / instalado / no instalado", () => {
    expect(agentChip(agent({}))).toEqual({ text: "conectado", tone: "ok" })
    expect(agentChip(agent({ loggedIn: false }))).toEqual({ text: "no logueado", tone: "warn" })
    expect(agentChip(agent({ loggedIn: false, detail: "Sin modelos" }))).toEqual({ text: "falta configurar", tone: "warn" })
    expect(agentChip(agent({ loggedIn: null }))).toEqual({ text: "instalado", tone: "info" })
    expect(agentChip(agent({ installed: false, loggedIn: null }))).toEqual({ text: "no instalado", tone: "off" })
  })

  it("labels agents", () => {
    expect(runnerAgentLabel("codex")).toBe("Codex CLI")
    expect(runnerAgentLabel("codex", "Mi Codex")).toBe("Mi Codex")
    expect(runnerAgentLabel("other")).toBe("other")
    expect(runnerAgentLabel(undefined)).toBe("Agente")
  })
})

describe("chat targets", () => {
  const agents = usableRunnerAgents([
    agent({}),
    agent({ id: "codex", label: "Codex CLI", loggedIn: null }),
    agent({ id: "gemini", label: "Gemini CLI", loggedIn: false }),
    agent({ id: "ollama", label: "Ollama", installed: false, loggedIn: null }),
  ])

  it("offers the team plus each usable agent", () => {
    expect(agents.map((item) => item.id)).toEqual(["claude", "codex"])
    expect(runnerTargetOptions(agents)).toEqual([
      { value: RUNNER_TEAM_TARGET, label: "Mi PC · orquestar (Claude Code + Codex CLI)" },
      { value: "runner:claude", label: "Mi PC · Claude Code" },
      { value: "runner:codex", label: "Mi PC · Codex CLI" },
    ])
    expect(runnerTargetOptions([agents[0]])).toEqual([{ value: "runner:claude", label: "Mi PC · Claude Code" }])
    expect(runnerTargetOptions([])).toEqual([])
  })

  it("builds the request for each target", () => {
    expect(isRunnerTarget("runner:team")).toBe(true)
    expect(isRunnerTarget("orchestrator")).toBe(false)
    expect(runnerRequestFor(RUNNER_TEAM_TARGET, "hola", agents)).toEqual({ path: "/orchestrate", body: { task: "hola", agents: ["claude", "codex"] } })
    expect(runnerRequestFor("runner:codex", "hola", agents)).toEqual({ path: "/run", body: { agent: "codex", prompt: "hola" } })
    expect(runnerRequestFor("runner:gemini", "hola", agents)).toBeNull()
    expect(runnerRequestFor("team", "hola", agents)).toBeNull()
    expect(runnerRequestFor(RUNNER_TEAM_TARGET, "hola", [])).toBeNull()
  })
})

describe("single run transcript", () => {
  it("shows a working line, streams the answer and marks it done", () => {
    const { items } = transcriptOf("run", [
      { type: "start", agent: "codex", label: "Codex CLI" },
      { type: "chunk", agent: "codex", text: "Hola " },
      { type: "chunk", agent: "codex", text: "mundo" },
      { type: "done", agent: "codex", label: "Codex CLI", text: "Hola mundo", ms: 2500 },
    ])
    expect(items).toEqual([
      { kind: "tool", id: "r1:run", turnId: "r1:run", status: "done", label: "Codex CLI terminó", detail: "2.5 s" },
      expect.objectContaining({ kind: "message", speaker: "Codex CLI", target: "Mi PC", message: "Hola mundo", role: "agent" }),
    ])
  })

  it("uses the final text when nothing streamed and notes truncation", () => {
    const { items } = transcriptOf("run", [
      { type: "start", agent: "gemini" },
      { type: "done", agent: "gemini", text: "respuesta", truncated: true },
    ])
    expect(items.map((item) => item.kind === "message" ? item.message : item.kind === "tool" ? item.label : "")).toEqual([
      "Gemini CLI terminó",
      "respuesta",
      "La respuesta era muy larga y se recortó.",
    ])
  })

  it("marks the line failed and shows the error", () => {
    const { items, chat } = transcriptOf("run", [
      { type: "start", agent: "claude" },
      { type: "error", agent: "claude", message: "Claude Code no tiene sesión iniciada. Corré: claude auth login" },
    ])
    expect(items[0]).toMatchObject({ kind: "tool", status: "failed" })
    expect(items[1]).toMatchObject({ kind: "message", role: "system", message: expect.stringContaining("claude auth login") })
    expect(chat.at(-1)).toMatchObject({ type: "error" })
  })
})

describe("orchestration transcript", () => {
  it("shows planning, each step, their answers and the final answer", () => {
    const { items } = transcriptOf("orchestrate", [
      { type: "start", task: "t", orchestrator: "claude", agents: ["claude", "codex", "gemini"] },
      { type: "planning", agent: "claude", label: "Claude Code" },
      { type: "plan", fallback: false, steps: [{ agent: "codex", subtask: "Escribí el código", label: "Codex CLI" }, { agent: "gemini", subtask: "Revisalo" }] },
      { type: "step_start", index: 0, agent: "codex", label: "Codex CLI", subtask: "Escribí el código" },
      { type: "step_start", index: 1, agent: "gemini", subtask: "Revisalo" },
      { type: "chunk", phase: "step", index: 0, agent: "codex", text: "ignored while working" },
      { type: "step_done", index: 0, agent: "codex", label: "Codex CLI", output: "function x() {}", ms: 1000 },
      { type: "step_error", index: 1, agent: "gemini", error: "Gemini CLI no tiene sesión iniciada" },
      { type: "synthesizing", agent: "claude", label: "Claude Code" },
      { type: "chunk", phase: "final", agent: "claude", text: "Listo: " },
      { type: "chunk", phase: "final", agent: "claude", text: "usá x()." },
      { type: "final", agent: "claude", label: "Claude Code", text: "Listo: usá x().", synthesized: true },
      { type: "done", ms: 5000 },
    ])
    const summary = items.map((item) => item.kind === "tool" ? `tool:${item.status}:${item.label}` : item.kind === "message" ? `msg:${item.speaker}:${item.message}` : item.kind)
    expect(summary).toEqual([
      "tool:done:Plan: 2 pasos",
      "tool:done:Codex CLI terminó",
      "tool:failed:Gemini CLI",
      "msg:Codex CLI:function x() {}",
      "tool:done:Claude Code armó la respuesta final",
      "msg:Claude Code:Listo: usá x().",
    ])
    expect(items[0]).toMatchObject({ detail: "Codex CLI: Escribí el código · Gemini CLI: Revisalo" })
    expect(items[3]).toMatchObject({ target: "Mi PC · paso 1" })
    expect(items[5]).toMatchObject({ target: "Mi PC · respuesta final", color: "#22d3ee" })
  })

  it("adds the final text when the synthesis did not stream", () => {
    const { items } = transcriptOf("orchestrate", [
      { type: "synthesizing", agent: "claude" },
      { type: "final", agent: "claude", text: "Todo junto", synthesized: true },
    ])
    expect(items.at(-1)).toMatchObject({ kind: "message", message: "Todo junto" })
  })

  it("explains the fallback plan and a failed synthesis", () => {
    const { items } = transcriptOf("orchestrate", [
      { type: "planning", agent: "codex" },
      { type: "plan_fallback", agent: "codex", reason: "no JSON" },
      { type: "plan", fallback: true, steps: [{ agent: "codex", subtask: "todo" }] },
      { type: "step_start", index: 0, agent: "codex" },
      { type: "step_done", index: 0, agent: "codex", output: "hecho" },
      { type: "final", agent: "codex", text: "hecho", synthesized: false },
      { type: "final", agent: "codex", text: "x", synthesized: false, note: "timeout" },
    ])
    expect(items[0]).toMatchObject({ kind: "tool", label: "Codex CLI se encarga de todo" })
    expect(items.filter((item) => item.kind === "message").map((item) => item.kind === "message" && item.message)).toEqual([
      "hecho",
      expect.stringContaining("(timeout)"),
    ])
  })

  it("closes spinning lines on an error or when the stream ends early", () => {
    const failed = transcriptOf("orchestrate", [
      { type: "planning", agent: "claude" },
      { type: "error", agent: "claude", message: "no pudo planificar" },
    ])
    expect(failed.items[0]).toMatchObject({ kind: "tool", status: "failed" })
    const cut = transcriptOf("orchestrate", [
      { type: "planning", agent: "claude" },
      { type: "plan", steps: [{ agent: "codex", subtask: "a" }] },
      { type: "step_start", index: 0, agent: "codex" },
    ], true)
    expect(cut.items.map((item) => item.kind === "tool" && item.status)).toEqual(["done", "failed"])
    const plain = transcriptOf("orchestrate", [{ type: "start" }, { type: "chunk", text: "" }, { type: "error" }])
    expect(plain.items).toEqual([expect.objectContaining({ message: "El runner no pudo completar la tarea." })])
  })

  it("keeps its details apart from hire transaction signatures", () => {
    const { items } = transcriptOf("run", [{ type: "start", agent: "codex" }, { type: "done", agent: "codex", ms: 300 }])
    const detail = items[0].kind === "tool" ? items[0].detail ?? "" : ""
    expect(detail).toBe("0.3 s")
    expect(looksLikeSignature(detail)).toBe(false)
    expect(looksLikeSignature("Plan: Codex CLI: a · Gemini CLI: b")).toBe(false)
    expect(looksLikeSignature("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW")).toBe(true)
  })

  it("ignores unknown events", () => {
    const mapper = createRunnerEventMapper("r", "orchestrate")
    expect(mapper.map({ type: "mystery" } as unknown as RunnerEvent)).toEqual([])
    expect(mapper.map({ type: "plan", steps: undefined } as unknown as RunnerEvent)).toEqual([expect.objectContaining({ label: "Plan: 0 pasos" })])
  })
})
