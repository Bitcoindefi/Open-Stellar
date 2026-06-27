import { describe, expect, it } from "vitest"
import { planWorkflow } from "@/lib/planner"

describe("planWorkflow", () => {
  it("creates a deterministic DAG for log threat goals without an API key", async () => {
    const result = await planWorkflow({
      goal: "Analyze the last 1000 log entries and produce a threat report",
      budget: { maxXLM: 1, maxTasks: 10 },
      deadline: "2026-06-22T18:00:00Z",
    })

    expect(result.planner).toBe("fallback")
    expect(result.deadline).toBe("2026-06-22T18:00:00.000Z")
    expect(result.plan).toEqual([
      expect.objectContaining({ step: 1, capability: "Log Analysis" }),
      expect.objectContaining({ step: 2, capability: "Threat Detection", dep: [1] }),
      expect.objectContaining({ step: 3, capability: "Data Viz", dep: [2] }),
    ])
  })

  it("rejects invalid budgets", async () => {
    await expect(planWorkflow({ goal: "Analyze logs and produce a report", budget: { maxXLM: 0 } })).rejects.toThrow("budget.maxXLM")
  })
})
