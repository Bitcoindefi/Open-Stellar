import { createApiRouteLogger } from "@/lib/api-logging"
import { estimateRerun, getOrchestrationRun } from "@/lib/orchestration/runs"

type RunRouteContext = {
  params: Promise<{ runId: string }>
}

export async function GET(req: Request, context: RunRouteContext) {
  const api = createApiRouteLogger(req, "/api/admin/runs/[runId]")
  const { runId } = await context.params
  const run = getOrchestrationRun(runId)

  if (!run) {
    return api.json(
      { ok: false, error: "run not found", runId },
      { status: 404 },
      { event: "orchestration.run.not_found", runId },
    )
  }

  return api.json({ ok: true, run, rerunEstimate: estimateRerun(run) }, undefined, {
    event: "orchestration.run.read",
    runId,
  })
}
