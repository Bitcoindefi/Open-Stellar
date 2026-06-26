import { NextResponse } from "next/server"
import { enqueueTask, isQueuedTaskStatus, listTasks } from "@/lib/agent-runtime/task-queue"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const agentId = url.searchParams.get("agent") ?? undefined
  const includeDeadLetter = url.searchParams.get("includeDeadLetter") === "1"
  const requestedStatus = url.searchParams.get("status")
  const status = isQueuedTaskStatus(requestedStatus) ? requestedStatus : undefined

  return NextResponse.json({
    ok: true,
    tasks: listTasks({ agentId, includeDeadLetter, status }),
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const task = enqueueTask({
      id: body.id ? String(body.id) : undefined,
      type: String(body.type || ""),
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      priority: body.priority,
      targetAgentId: body.targetAgentId ? String(body.targetAgentId) : undefined,
      targetDistrict: body.targetDistrict,
      targetCapability: body.targetCapability ? String(body.targetCapability) : undefined,
      maxRetries: body.maxRetries,
      scheduledFor: body.scheduledFor ? String(body.scheduledFor) : undefined,
    })

    return NextResponse.json({ ok: true, task }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to enqueue task" },
      { status: 400 },
    )
  }
}
