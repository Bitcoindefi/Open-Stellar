import { beforeEach, describe, expect, it } from "vitest"
import { GET as getRun } from "@/app/api/admin/runs/[runId]/route"
import { GET as listRuns, POST as postRun } from "@/app/api/admin/runs/route"
import { createRerun, getOrchestrationRun, listOrchestrationRuns, resetOrchestrationRunsForTests } from "@/lib/orchestration/runs"

beforeEach(() => {
  resetOrchestrationRunsForTests()
})

describe("orchestration run history", () => {
  it("lists run summaries with aggregate stats", () => {
    const data = listOrchestrationRuns()

    expect(data.runs.length).toBeGreaterThanOrEqual(3)
    expect(data.stats.completedRuns).toBe(2)
    expect(data.stats.failedRuns).toBe(1)
    expect(data.runs[0]).toHaveProperty("stepsCompleted")
  })

  it("returns run detail with steps and a re-run estimate", async () => {
    const res = await getRun(new Request("http://localhost/api/admin/runs/run_001"), {
      params: Promise.resolve({ runId: "run_001" }),
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.run.steps[0].input).toHaveProperty("source")
    expect(data.rerunEstimate.estimatedCostXlm).toBe("0.07")
  })

  it("creates queued re-runs with copied goals and reset steps", () => {
    const result = createRerun("run_003")

    expect(result?.run.status).toBe("running")
    expect(result?.run.goal).toBe(getOrchestrationRun("run_003")?.goal)
    expect(result?.run.steps[0].status).toBe("running")
    expect(result?.run.steps[1].status).toBe("queued")
    expect(result?.estimate.estimatedCostXlm).toBe("0.01")
  })

  it("serves list and re-run API routes", async () => {
    const listRes = await listRuns(new Request("http://localhost/api/admin/runs"))
    const listData = await listRes.json()

    expect(listRes.status).toBe(200)
    expect(listData.runs.length).toBeGreaterThanOrEqual(3)

    const rerunRes = await postRun(new Request("http://localhost/api/admin/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: "run_001" }),
    }))
    const rerunData = await rerunRes.json()

    expect(rerunRes.status).toBe(200)
    expect(rerunData.ok).toBe(true)
    expect(rerunData.run.id).toBe("run_004")
    expect(rerunData.run.steps).toHaveLength(3)
  })
})
