import { NextResponse } from "next/server"
import { updateTask, getTask } from "@/lib/agents/task-queue"
import { awardTaskXP } from "@/lib/gamification/xp"

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id, taskId } = await context.params
    const agentId = decodeURIComponent(id)
    const decodedTaskId = decodeURIComponent(taskId)
    const body = await req.json().catch(() => ({}))

    if (!body.status || (body.status !== "completed" && body.status !== "failed")) {
      return NextResponse.json(
        { ok: false, error: "status must be 'completed' or 'failed'" },
        { status: 400 },
      )
    }

    const task = updateTask(agentId, decodedTaskId, {
      status: body.status,
      result: body.result,
    })

    if (!task) {
      return NextResponse.json(
        { ok: false, error: "Task not found or not in running state" },
        { status: 404 },
      )
    }

    if (task.status === "completed") {
      awardTaskXP({
        agentId,
        durationMs: task.startedAt && task.completedAt
          ? task.completedAt - task.startedAt
          : undefined,
      })
    }

    return NextResponse.json(
      { ok: true, task },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update task" },
      { status: 400 },
    )
  }
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id, taskId } = await context.params
    const agentId = decodeURIComponent(id)
    const decodedTaskId = decodeURIComponent(taskId)
    const task = getTask(agentId, decodedTaskId)

    if (!task) {
      return NextResponse.json(
        { ok: false, error: "Task not found" },
        { status: 404 },
      )
    }

    return NextResponse.json(
      { ok: true, task },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to get task" },
      { status: 400 },
    )
  }
}
