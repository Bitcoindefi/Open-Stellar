import { NextResponse } from "next/server"
import { createTask, purgeAgentTasks } from "@/lib/agents/task-queue"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)
    const body = await req.json().catch(() => ({}))

    if (!body.type || typeof body.type !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'type' field" },
        { status: 400 },
      )
    }

    const { task, overflow } = createTask(agentId, {
      type: body.type,
      payload: body.payload,
    })

    if (overflow) {
      return NextResponse.json(
        { ok: false, error: "Queue full: max 100 pending tasks per agent" },
        { status: 429 },
      )
    }

    return NextResponse.json(
      { ok: true, taskId: task.id },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 400 },
    )
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)

    const purged = purgeAgentTasks(agentId)

    return NextResponse.json(
      { ok: true, purged },
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to purge tasks" },
      { status: 400 },
    )
  }
}
