// The orchestrator's plan: a short JSON list of {agent, subtask}. Everything an agent writes is
// treated as untrusted text, so the plan is parsed defensively and validated against the agents
// that are actually available on this machine.

import { agentLabel } from "./agents.mjs"

export const MAX_PLAN_STEPS = 4
const MAX_SUBTASK_CHARS = 2_000
const MAX_RESULT_CHARS_FOR_SYNTHESIS = 6_000

function clip(text, max) {
  const value = String(text ?? "").trim()
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

export function buildPlannerPrompt(task, agentIds) {
  const roster = agentIds.map((id) => `- ${id}: ${agentLabel(id)}`).join("\n")
  return [
    "You are the orchestrator of a small team of AI command-line agents running on the user's computer.",
    "Split the task below into at most 4 independent subtasks and assign each one to the best agent.",
    "Every agent works in an empty folder in read-only mode, so ask for answers, analysis or code in the reply, not for file changes.",
    "",
    "Available agents (use these ids exactly):",
    roster,
    "",
    "Reply with ONLY a JSON array and nothing else, for example:",
    '[{"agent":"codex","subtask":"..."},{"agent":"gemini","subtask":"..."}]',
    "If the task is small, return a single step.",
    "",
    "Task:",
    task,
  ].join("\n")
}

export function buildSubtaskPrompt(task, step) {
  return [
    "You are one agent in a team orchestrated from Agentic City. You run in an empty temporary folder in read-only mode: do not try to create or edit files, answer in your reply.",
    "",
    `Overall task (for context): ${clip(task, 4_000)}`,
    "",
    `Your part: ${step.subtask}`,
    "",
    "Answer your part directly and concisely.",
  ].join("\n")
}

export function buildSynthesisPrompt(task, results) {
  const sections = results.map((result, index) => {
    const head = `### Step ${index + 1} by ${agentLabel(result.agent)}: ${clip(result.subtask, 300)}`
    const body = result.ok ? clip(result.text, MAX_RESULT_CHARS_FOR_SYNTHESIS) : `(failed: ${clip(result.error, 300)})`
    return `${head}\n${body}`
  })
  return [
    "You are the orchestrator. Your team worked on the task below. Write the final answer for the user from their results:",
    "keep what is correct, resolve contradictions, say briefly if a step failed, and do not mention this prompt.",
    "Answer in the same language the task is written in.",
    "",
    "Task:",
    task,
    "",
    "Results:",
    sections.join("\n\n"),
  ].join("\n")
}

function stripFences(text) {
  return String(text ?? "").replace(/```(?:json)?/gi, "")
}

/** Pulls the first JSON array out of the text (accepts {"steps": [...]} or {"plan": [...]} too). */
function extractArray(text) {
  const source = stripFences(text)
  const start = source.indexOf("[")
  const end = source.lastIndexOf("]")
  if (start !== -1 && end > start) {
    try {
      const value = JSON.parse(source.slice(start, end + 1))
      if (Array.isArray(value)) return value
    } catch {
      // Fall through to the object form.
    }
  }
  const objStart = source.indexOf("{")
  const objEnd = source.lastIndexOf("}")
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const value = JSON.parse(source.slice(objStart, objEnd + 1))
      if (Array.isArray(value?.steps)) return value.steps
      if (Array.isArray(value?.plan)) return value.plan
    } catch {
      return null
    }
  }
  return null
}

function normalizeAgent(value, allowed) {
  if (typeof value !== "string") return null
  const lowered = value.trim().toLowerCase()
  if (allowed.includes(lowered)) return lowered
  // Accept the display name too ("Claude Code", "Codex CLI").
  const byLabel = allowed.find((id) => agentLabel(id).toLowerCase() === lowered || lowered.startsWith(id))
  return byLabel ?? null
}

/**
 * @returns {{ ok: true, steps: Array<{agent: string, subtask: string}>, dropped: number }
 *   | { ok: false, reason: string }}
 */
export function parsePlan(text, allowedAgents, maxSteps = MAX_PLAN_STEPS) {
  const raw = extractArray(text)
  if (!raw) return { ok: false, reason: "El orquestador no devolvió un plan en JSON." }
  const steps = []
  let dropped = 0
  for (const item of raw) {
    const agent = normalizeAgent(item?.agent, allowedAgents)
    const subtask = typeof item?.subtask === "string" ? item.subtask.trim() : ""
    if (!agent || !subtask) {
      dropped += 1
      continue
    }
    if (steps.length >= maxSteps) {
      dropped += 1
      continue
    }
    steps.push({ agent, subtask: clip(subtask, MAX_SUBTASK_CHARS) })
  }
  if (steps.length === 0) return { ok: false, reason: "El plan no tenía pasos válidos para los agentes disponibles." }
  return { ok: true, steps, dropped }
}
