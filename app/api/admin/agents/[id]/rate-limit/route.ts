import { NextResponse } from "next/server"
import { setAgentHighPriorityLimit } from "@/lib/agent-runtime/high-priority-rate-limit"
import { isAuthorized } from "@/lib/auth"

interface RouteContext {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

export async function PATCH(req: Request, context: RouteContext) {
  if (process.env.MOLTBOT_GATEWAY_TOKEN && !isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)
    const body = await req.json().catch(() => ({}))

    const limit = body.highPriorityPerMinute ?? body.limit
    if (typeof limit !== "number" || Number.isNaN(limit) || limit < 0) {
      return NextResponse.json(
        { ok: false, error: "highPriorityPerMinute must be a non-negative number" },
        { status: 400 },
      )
    }

    const state = setAgentHighPriorityLimit(agentId, limit)

    return NextResponse.json(
      {
        ok: true,
        agentId,
        highPriorityPerMinute: state.limit,
        limit: state.limit,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update rate limit" },
      { status: 400 },
    )
  }
}
