import { NextResponse } from "next/server"
import { drainAgentTasks } from "@/lib/agents/task-queue"
import { publishSystemEvent } from "@/lib/events/system-events"
import { createApiRouteLogger } from "@/lib/api-logging"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, "/api/agents/[id]/tasks/drain")

  try {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)
    const body = await req.json().catch(() => ({}))

    const maxItems = body.maxItems ? Math.max(1, Number(body.maxItems)) : undefined

    const { result, alreadyDraining } = await drainAgentTasks(agentId, {
      maxItems,
      processor: async (task) => {
        // Emit task.completed event for each successfully processed task
        publishSystemEvent({
          type: "task.completed",
          agentId: task.agentId,
          taskId: task.id,
          result: { summary: `Completed task of type ${task.type}` },
        })
      },
    })

    if (alreadyDraining) {
      return await api.json(
        { ok: false, error: "Drain already in progress for this agent" },
        { status: 409 },
        { event: "task.drain.conflict", agentId },
      )
    }

    return await api.json(
      {
        ok: true,
        processed: result!.processed,
        skipped: result!.skipped,
        errors: result!.errors,
        durationMs: result!.durationMs,
      },
      undefined,
      {
        event: "task.drain.completed",
        agentId,
        processed: result!.processed,
        errors: result!.errors.length,
      },
    )
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed to drain tasks" },
      { status: 500 },
      { event: "task.drain.failed" },
    )
  }
}
