import { NextResponse } from "next/server"
import { retryDeadLetterTask } from "@/lib/agent-runtime/task-queue"

type TaskRouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, context: TaskRouteContext) {
  const { id } = await context.params
  try {
    return NextResponse.json({ ok: true, task: retryDeadLetterTask(id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retry dead-letter task"
    return NextResponse.json({ ok: false, error: message }, { status: message === "Task not found" ? 404 : 400 })
  }
}
