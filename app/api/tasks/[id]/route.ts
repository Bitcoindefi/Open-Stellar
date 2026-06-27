import { NextResponse } from "next/server"
import { getTaskAsync } from "@/lib/agent-runtime/task-queue"

type TaskRouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: TaskRouteContext) {
  const { id } = await context.params
  const task = await getTaskAsync(id)
  if (!task) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 })
  return NextResponse.json({ ok: true, task })
}
