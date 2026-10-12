import { describe, expect, it } from "vitest"
import { MAX_PLAN_STEPS, buildPlannerPrompt, buildSubtaskPrompt, buildSynthesisPrompt, parsePlan } from "../src/plan.mjs"

const team = ["claude", "codex", "gemini"]

describe("parsePlan", () => {
  it("accepts a clean JSON array", () => {
    const result = parsePlan('[{"agent":"codex","subtask":"Escribí la función"},{"agent":"gemini","subtask":"Revisá casos borde"}]', team)
    expect(result).toEqual({ ok: true, dropped: 0, steps: [{ agent: "codex", subtask: "Escribí la función" }, { agent: "gemini", subtask: "Revisá casos borde" }] })
  })

  it("finds the array inside code fences and prose", () => {
    const text = "Here is the plan:\n```json\n[{\"agent\": \"Claude\", \"subtask\": \"Plan the API\"}]\n```\nGood luck!"
    expect(parsePlan(text, team)).toMatchObject({ ok: true, steps: [{ agent: "claude", subtask: "Plan the API" }] })
  })

  it("accepts {steps: [...]} and {plan: [...]} objects and display names", () => {
    expect(parsePlan('{"steps":[{"agent":"Codex CLI","subtask":"a"}]}', team)).toMatchObject({ ok: true, steps: [{ agent: "codex" }] })
    expect(parsePlan('{"plan":[{"agent":"gemini cli","subtask":"b"}]}', team)).toMatchObject({ ok: true, steps: [{ agent: "gemini" }] })
  })

  it("drops steps for agents that are not available or have no subtask", () => {
    const text = JSON.stringify([
      { agent: "ollama", subtask: "not here" },
      { agent: "codex", subtask: "   " },
      { agent: 3, subtask: "x" },
      null,
      { agent: "claude", subtask: "ok" },
    ])
    expect(parsePlan(text, team)).toEqual({ ok: true, dropped: 4, steps: [{ agent: "claude", subtask: "ok" }] })
  })

  it(`keeps at most ${MAX_PLAN_STEPS} steps`, () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ agent: team[i % 3], subtask: `step ${i}` }))
    const result = parsePlan(JSON.stringify(many), team)
    expect(result.ok && result.steps).toHaveLength(MAX_PLAN_STEPS)
    expect(result.ok && result.dropped).toBe(3)
  })

  it("clips very long subtasks", () => {
    const result = parsePlan(JSON.stringify([{ agent: "codex", subtask: "x".repeat(5000) }]), team)
    expect(result.ok && result.steps[0].subtask.length).toBe(2000)
  })

  it("fails on prose, broken JSON or an empty plan", () => {
    expect(parsePlan("I would ask Codex first.", team)).toMatchObject({ ok: false })
    expect(parsePlan("[{\"agent\": \"codex\",", team)).toMatchObject({ ok: false })
    expect(parsePlan("{\"steps\": 3}", team)).toMatchObject({ ok: false })
    expect(parsePlan("{broken", team)).toMatchObject({ ok: false })
    expect(parsePlan("[]", team)).toMatchObject({ ok: false, reason: expect.stringContaining("pasos válidos") })
    expect(parsePlan(undefined, team)).toMatchObject({ ok: false })
  })
})

describe("prompts", () => {
  it("planner prompt lists only the available agent ids and the task", () => {
    const prompt = buildPlannerPrompt("Armá un README", ["codex", "gemini"])
    expect(prompt).toContain("- codex: Codex CLI")
    expect(prompt).toContain("- gemini: Gemini CLI")
    expect(prompt).not.toContain("- claude:")
    expect(prompt).toContain("Reply with ONLY a JSON array")
    expect(prompt.trim().endsWith("Armá un README")).toBe(true)
  })

  it("subtask prompt carries the overall task and the part", () => {
    const prompt = buildSubtaskPrompt("Tarea general", { agent: "codex", subtask: "Tu parte" })
    expect(prompt).toContain("Overall task (for context): Tarea general")
    expect(prompt).toContain("Your part: Tu parte")
    expect(prompt).toContain("read-only")
  })

  it("synthesis prompt includes each result and marks failures", () => {
    const prompt = buildSynthesisPrompt("Tarea", [
      { agent: "codex", subtask: "A", ok: true, text: "resultado A" },
      { agent: "gemini", subtask: "B", ok: false, error: "timeout" },
    ])
    expect(prompt).toContain("### Step 1 by Codex CLI: A\nresultado A")
    expect(prompt).toContain("### Step 2 by Gemini CLI: B\n(failed: timeout)")
  })
})
