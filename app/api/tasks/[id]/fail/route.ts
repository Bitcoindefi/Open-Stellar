import { NextResponse } from "next/server"
import { failTask } from "@/lib/agent-runtime/task-queue"

type TaskRouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, context: TaskRouteContext) {
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  try {
    return NextResponse.json({ ok: true, task: failTask(id, String(body.error || "Task failed")) })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to mark task failed" },
      { status: 400 },
    )
  }
}
