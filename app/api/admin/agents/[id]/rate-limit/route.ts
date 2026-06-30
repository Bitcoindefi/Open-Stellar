import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/auth"
import { setHighPriorityPerMinute } from "@/lib/agents/high-priority-rate-limit-store"

interface RouteContext {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

export async function PATCH(req: Request, context: RouteContext) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)
    const body = await req.json().catch(() => ({}))

    const highPriorityPerMinute = body?.highPriorityPerMinute
    if (!Number.isFinite(highPriorityPerMinute)) {
      return NextResponse.json(
        { ok: false, error: "highPriorityPerMinute must be a number" },
        { status: 400 },
      )
    }

    setHighPriorityPerMinute(agentId, Number(highPriorityPerMinute))

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update rate limit" },
      { status: 400 },
    )
  }
}

