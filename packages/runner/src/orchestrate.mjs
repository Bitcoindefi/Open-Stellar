// Simple orchestration: the orchestrator plans, the agents work in parallel (two at a time),
// and the orchestrator writes the final answer. Every step is reported as an event so the web app
// can show "Claude is planning", "Codex is working on X", "Gemini done" and the answer.

import { agentLabel } from "./agents.mjs"
import { buildPlannerPrompt, buildSubtaskPrompt, buildSynthesisPrompt, parsePlan } from "./plan.mjs"

export const DEFAULT_CONCURRENCY = 2
const MAX_STEP_OUTPUT_CHARS = 8_000

function clip(text, max) {
  const value = String(text ?? "")
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

/** Picks who orchestrates: the requested agent, else Claude Code, else the first available. */
export function pickOrchestrator(requested, available) {
  if (requested && available.includes(requested)) return requested
  if (available.includes("claude")) return "claude"
  return available[0] ?? null
}

/** Runs async jobs with at most `limit` in flight, keeping results in input order. */
export async function runPool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(lanes)
  return results
}

/**
 * @param {{
 *   task: string,
 *   agents?: string[],
 *   orchestrator?: string,
 *   available: string[],
 *   runAgent: (agentId: string, prompt: string, options: { onChunk?: (text: string) => void, signal?: AbortSignal }) => Promise<{ ok: boolean, text: string, error?: string }>,
 *   emit: (event: Record<string, unknown>) => void,
 *   concurrency?: number,
 *   signal?: AbortSignal,
 *   now?: () => number,
 * }} options
 */
export async function orchestrate({ task, agents, orchestrator, available, runAgent, emit, concurrency = DEFAULT_CONCURRENCY, signal, now = Date.now }) {
  const startedAt = now()
  const requested = Array.isArray(agents) && agents.length > 0 ? agents : available
  const team = requested.filter((id, index) => available.includes(id) && requested.indexOf(id) === index)
  const lead = pickOrchestrator(orchestrator, available)
  if (!lead || team.length === 0) {
    emit({ type: "error", message: "No hay agentes disponibles en esta PC. Instalá o iniciá sesión en Claude Code, Codex, Gemini CLI u Ollama." })
    return { ok: false }
  }

  emit({ type: "start", task, orchestrator: lead, agents: team })
  emit({ type: "planning", agent: lead, label: agentLabel(lead) })
  const planning = await runAgent(lead, buildPlannerPrompt(task, team), { signal })
  if (signal?.aborted) return { ok: false }
  if (!planning.ok) {
    emit({ type: "error", agent: lead, message: planning.error || `${agentLabel(lead)} no pudo planificar.` })
    return { ok: false }
  }

  const plan = parsePlan(planning.text, team)
  let steps
  let fallback = false
  if (plan.ok) {
    steps = plan.steps
  } else {
    fallback = true
    steps = [{ agent: lead, subtask: task }]
    emit({ type: "plan_fallback", agent: lead, label: agentLabel(lead), reason: plan.reason })
  }
  emit({ type: "plan", steps: steps.map((step) => ({ ...step, label: agentLabel(step.agent) })), fallback })

  const results = await runPool(steps, concurrency, async (step, index) => {
    if (signal?.aborted) return { ...step, ok: false, text: "", error: "Cancelado." }
    const stepStarted = now()
    emit({ type: "step_start", index, agent: step.agent, label: agentLabel(step.agent), subtask: step.subtask })
    const prompt = fallback ? task : buildSubtaskPrompt(task, step)
    const result = await runAgent(step.agent, prompt, {
      signal,
      onChunk: (text) => emit({ type: "chunk", phase: "step", index, agent: step.agent, text }),
    })
    const ms = now() - stepStarted
    if (result.ok) {
      emit({ type: "step_done", index, agent: step.agent, label: agentLabel(step.agent), output: clip(result.text, MAX_STEP_OUTPUT_CHARS), ms })
    } else {
      emit({ type: "step_error", index, agent: step.agent, label: agentLabel(step.agent), error: result.error || "Falló.", ms })
    }
    return { ...step, ...result }
  })
  if (signal?.aborted) return { ok: false }

  const succeeded = results.filter((result) => result.ok)
  if (succeeded.length === 0) {
    emit({ type: "error", message: "Ningún agente pudo completar su parte." })
    return { ok: false }
  }

  // One useful answer needs no extra round trip through the orchestrator.
  if (fallback || results.length === 1) {
    emit({ type: "final", agent: succeeded[0].agent, label: agentLabel(succeeded[0].agent), text: succeeded[0].text, synthesized: false })
    emit({ type: "done", ms: now() - startedAt })
    return { ok: true, text: succeeded[0].text }
  }

  emit({ type: "synthesizing", agent: lead, label: agentLabel(lead) })
  const synthesis = await runAgent(lead, buildSynthesisPrompt(task, results), {
    signal,
    onChunk: (text) => emit({ type: "chunk", phase: "final", agent: lead, text }),
  })
  if (signal?.aborted) return { ok: false }
  if (synthesis.ok) {
    emit({ type: "final", agent: lead, label: agentLabel(lead), text: synthesis.text, synthesized: true })
    emit({ type: "done", ms: now() - startedAt })
    return { ok: true, text: synthesis.text }
  }

  // The orchestrator failed at the end: hand back what the team produced.
  const joined = succeeded.map((result) => `## ${agentLabel(result.agent)}\n${result.text}`).join("\n\n")
  emit({ type: "final", agent: lead, label: agentLabel(lead), text: joined, synthesized: false, note: synthesis.error || "No se pudo sintetizar." })
  emit({ type: "done", ms: now() - startedAt })
  return { ok: true, text: joined }
}
