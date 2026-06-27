import { createApiRouteLogger } from "@/lib/api-logging"
import { orchestrateWorkflow } from "@/lib/orchestrator"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/orchestrate")

  try {
    const body = await req.json()
    const result = await orchestrateWorkflow({
      goal: body.goal,
      budget: body.budget,
      deadline: body.deadline,
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    return api.json(
      { ok: true, runId: result.runId, plan: result.plan, totalEstimatedCost: result.totalEstimatedCost },
      { status: 201 },
      { event: "orchestration.run.created", runId: result.runId, planner: result.planner },
    )
  } catch (error) {
    return api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed to orchestrate workflow" },
      { status: 400 },
      { event: "orchestration.run.create_failed" },
    )
  }
}
