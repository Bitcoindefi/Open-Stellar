import { NextResponse } from "next/server"
import { discardDeadLetterTask } from "@/lib/agent-runtime/task-queue"

type TaskRouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, context: TaskRouteContext) {
  const { id } = await context.params
  try {
    return NextResponse.json({ ok: true, task: discardDeadLetterTask(id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to discard dead-letter task"
    return NextResponse.json({ ok: false, error: message }, { status: message === "Task not found" ? 404 : 400 })
  }
}
