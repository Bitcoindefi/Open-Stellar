import { createApiRouteLogger } from "@/lib/api-logging"
import { createRerun, listOrchestrationRuns } from "@/lib/orchestration/runs"
import { withApiKeyAuth } from "@/lib/auth/api-key-middleware"

export const GET = withApiKeyAuth(async (req: Request) => {
  const api = createApiRouteLogger(req, "/api/admin/runs")
  return api.json({ ok: true, ...listOrchestrationRuns() }, undefined, {
    event: "orchestration.runs.list",
  })
}, { keyType: 'admin' })

export const POST = withApiKeyAuth(async (req: Request) => {
  const api = createApiRouteLogger(req, "/api/admin/runs")

  try {
    const body = await req.json()
    const sourceRunId = String(body.runId || "")
    const result = createRerun(sourceRunId)

    if (!result) {
      return api.json(
        { ok: false, error: "runId not found" },
        { status: 404 },
        { event: "orchestration.rerun.not_found", sourceRunId },
      )
    }

    return api.json({ ok: true, ...result }, undefined, {
      event: "orchestration.rerun.created",
      sourceRunId,
      runId: result.run.id,
      estimatedCostXlm: result.estimate.estimatedCostXlm,
    })
  } catch (error) {
    return api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed creating re-run" },
      { status: 500 },
      { event: "orchestration.rerun.failed" },
    )
  }
}, { keyType: 'admin' })
