// What the local runner streams, and how it becomes the chat transcript the panel already draws
// (agent messages and one tool line per step). Runner agents are the person's own CLIs, so there
// are no hires, receipts or payments here.

import type { ChatStreamEvent } from "@/lib/orchestration/events"
import type { RunnerAgent, RunnerAgentId } from "@/lib/runner/client"

type Step = { agent: string; subtask: string; label?: string }

export type RunnerEvent =
  | { type: "start"; agent?: string; label?: string; task?: string; orchestrator?: string; agents?: string[] }
  | { type: "planning"; agent: string; label?: string }
  | { type: "plan"; steps: Step[]; fallback?: boolean }
  | { type: "plan_fallback"; agent: string; label?: string; reason?: string }
  | { type: "step_start"; index: number; agent: string; label?: string; subtask?: string }
  | { type: "chunk"; phase?: "step" | "final"; index?: number; agent?: string; text: string }
  | { type: "step_done"; index: number; agent: string; label?: string; output?: string; ms?: number }
  | { type: "step_error"; index: number; agent: string; label?: string; error?: string; ms?: number }
  | { type: "synthesizing"; agent: string; label?: string }
  | { type: "final"; agent: string; label?: string; text?: string; synthesized?: boolean; note?: string }
  | { type: "done"; agent?: string; label?: string; text?: string; ms?: number; truncated?: boolean }
  | { type: "error"; agent?: string; label?: string; message?: string }

const LABELS: Record<RunnerAgentId, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  ollama: "Ollama",
}

export const RUNNER_TEAM_TARGET = "runner:team"
const RUNNER_PREFIX = "runner:"
const LOCAL = "Mi PC"

export function runnerAgentLabel(agent: string | undefined, label?: string): string {
  if (label) return label
  return (agent && LABELS[agent as RunnerAgentId]) || agent || "Agente"
}

export type AgentChip = { text: string; tone: "ok" | "warn" | "off" | "info" }

/** The status chip next to each agent in the "Conectá tu PC" card. */
export function agentChip(agent: Pick<RunnerAgent, "installed" | "loggedIn" | "detail">): AgentChip {
  if (!agent.installed) return { text: "no instalado", tone: "off" }
  if (agent.loggedIn === true) return { text: "conectado", tone: "ok" }
  if (agent.loggedIn === false) return { text: agent.detail ? "falta configurar" : "no logueado", tone: "warn" }
  return { text: "instalado", tone: "info" }
}

/** Agents the chat can send work to: installed and not known to be logged out. */
export function usableRunnerAgents(agents: RunnerAgent[]): RunnerAgent[] {
  return agents.filter((agent) => agent.installed && agent.loggedIn !== false)
}

export function isRunnerTarget(target: string): boolean {
  return target.startsWith(RUNNER_PREFIX)
}

export type RunnerTargetOption = { value: string; label: string }

export function runnerTargetOptions(agents: RunnerAgent[]): RunnerTargetOption[] {
  if (agents.length === 0) return []
  const team = agents.length > 1
    ? [{ value: RUNNER_TEAM_TARGET, label: `${LOCAL} · orquestar (${agents.map((agent) => agent.label).join(" + ")})` }]
    : []
  return [...team, ...agents.map((agent) => ({ value: `${RUNNER_PREFIX}${agent.id}`, label: `${LOCAL} · ${agent.label}` }))]
}

/** What to POST for a chat message sent to a runner target, or null if the target is not usable. */
export function runnerRequestFor(target: string, message: string, agents: RunnerAgent[]): { path: "/run" | "/orchestrate"; body: Record<string, unknown> } | null {
  if (!isRunnerTarget(target) || agents.length === 0) return null
  if (target === RUNNER_TEAM_TARGET) return { path: "/orchestrate", body: { task: message, agents: agents.map((agent) => agent.id) } }
  const agent = agents.find((item) => `${RUNNER_PREFIX}${item.id}` === target)
  return agent ? { path: "/run", body: { agent: agent.id, prompt: message } } : null
}

function seconds(ms: number | undefined): string {
  return typeof ms === "number" && ms >= 0 ? `${(ms / 1000).toFixed(1)} s` : ""
}

function clip(text: string | undefined, max = 120): string {
  const single = String(text ?? "").replace(/\s+/g, " ").trim()
  return single.length > max ? `${single.slice(0, max - 3)}...` : single
}

function pasos(count: number): string {
  return count === 1 ? "1 paso" : `${count} pasos`
}

/**
 * Turns runner events into chat events for one request. `mode` is "run" for a single agent
 * and "orchestrate" for the team. Keeps a little state (open tool lines, whether the answer
 * already streamed) between calls; `finish()` closes any line left spinning when the stream ends.
 */
export function createRunnerEventMapper(runId: string, mode: "run" | "orchestrate") {
  const runTurn = `${runId}:run`
  const finalTurn = `${runId}:final`
  const planCall = `${runId}:plan`
  const stepCall = (index: number) => `${runId}:step:${index}`
  let finalStreamed = false
  let runStreamed = false
  const open = new Map<string, string>()

  const track = (events: ChatStreamEvent[]): ChatStreamEvent[] => {
    for (const event of events) {
      if (event.type !== "tool") continue
      if (event.status === "running") open.set(event.callId, event.label)
      else open.delete(event.callId)
    }
    return events
  }

  const closeOpen = (): ChatStreamEvent[] => {
    const closing: ChatStreamEvent[] = [...open.entries()].map(([callId, label]) => ({ type: "tool", turnId: callId, callId, status: "failed", label }))
    open.clear()
    return closing
  }

  const map = (event: RunnerEvent): ChatStreamEvent[] => {
    const label = runnerAgentLabel("agent" in event ? event.agent : undefined, "label" in event ? event.label : undefined)
    switch (event.type) {
      case "start":
        if (mode !== "run") return []
        return [
          { type: "agent-start", turnId: runTurn, agentId: event.agent || "runner", name: label, model: LOCAL, depth: 0 },
          { type: "tool", turnId: runTurn, callId: runTurn, status: "running", label: `${label} está trabajando` },
        ]
      case "planning":
        return [{ type: "tool", turnId: planCall, callId: planCall, status: "running", label: `${label} está planificando` }]
      case "plan": {
        const steps = Array.isArray(event.steps) ? event.steps : []
        if (event.fallback) {
          const lead = runnerAgentLabel(steps[0]?.agent, steps[0]?.label)
          return [{ type: "tool", turnId: planCall, callId: planCall, status: "done", label: `${lead} se encarga de todo`, detail: "el plan no vino en JSON" }]
        }
        const detail = steps.map((step) => `${runnerAgentLabel(step.agent, step.label)}: ${clip(step.subtask, 60)}`).join(" · ")
        return [{ type: "tool", turnId: planCall, callId: planCall, status: "done", label: `Plan: ${pasos(steps.length)}`, ...(detail ? { detail } : {}) }]
      }
      case "step_start":
        return [{ type: "tool", turnId: stepCall(event.index), callId: stepCall(event.index), status: "running", label: `${label} está trabajando`, ...(event.subtask ? { detail: clip(event.subtask) } : {}) }]
      case "step_done": {
        const turnId = stepCall(event.index)
        const out: ChatStreamEvent[] = [{ type: "tool", turnId, callId: turnId, status: "done", label: `${label} terminó`, ...(seconds(event.ms) ? { detail: seconds(event.ms) } : {}) }]
        if (event.output) {
          out.push(
            { type: "agent-start", turnId, agentId: event.agent, name: label, model: `${LOCAL} · paso ${event.index + 1}`, depth: 1 },
            { type: "text", turnId, delta: event.output },
            { type: "agent-end", turnId },
          )
        }
        return out
      }
      case "step_error":
        return [{ type: "tool", turnId: stepCall(event.index), callId: stepCall(event.index), status: "failed", label, ...(event.error ? { detail: clip(event.error, 160) } : {}) }]
      case "synthesizing":
        return [
          { type: "tool", turnId: finalTurn, callId: finalTurn, status: "running", label: `${label} está armando la respuesta final` },
          { type: "agent-start", turnId: finalTurn, agentId: "orchestrator", name: label, model: `${LOCAL} · respuesta final`, depth: 0 },
        ]
      case "chunk":
        if (mode === "run") {
          runStreamed = true
          return event.text ? [{ type: "text", turnId: runTurn, delta: event.text }] : []
        }
        if (event.phase === "final" && event.text) {
          finalStreamed = true
          return [{ type: "text", turnId: finalTurn, delta: event.text }]
        }
        return []
      case "final": {
        if (!event.synthesized) {
          return event.note ? [{ type: "notice", message: `No se pudo armar la respuesta final (${clip(event.note, 120)}). Arriba está lo que hizo cada agente.` }] : []
        }
        const out: ChatStreamEvent[] = [{ type: "tool", turnId: finalTurn, callId: finalTurn, status: "done", label: `${label} armó la respuesta final` }]
        if (!finalStreamed && event.text) out.push({ type: "text", turnId: finalTurn, delta: event.text })
        return out
      }
      case "done": {
        if (mode !== "run") return []
        const out: ChatStreamEvent[] = [{ type: "tool", turnId: runTurn, callId: runTurn, status: "done", label: `${label} terminó`, ...(seconds(event.ms) ? { detail: seconds(event.ms) } : {}) }]
        if (!runStreamed && event.text) out.push({ type: "text", turnId: runTurn, delta: event.text })
        if (event.truncated) out.push({ type: "notice", message: "La respuesta era muy larga y se recortó." })
        return out
      }
      case "error":
        return [...closeOpen(), { type: "error", message: event.message || "El runner no pudo completar la tarea." }]
      default:
        return []
    }
  }

  return {
    map: (event: RunnerEvent): ChatStreamEvent[] => track(map(event)),
    /** Lines still spinning when the stream ended (runner closed, network drop) become failed. */
    finish: (): ChatStreamEvent[] => closeOpen(),
  }
}
