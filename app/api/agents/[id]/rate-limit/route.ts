import { NextResponse } from "next/server"
import { getAgentHighPriorityStatus } from "@/lib/agent-runtime/high-priority-rate-limit"

interface RouteContext {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)
    const status = getAgentHighPriorityStatus(agentId)

    return NextResponse.json(
      {
        ok: true,
        agentId: status.agentId,
        limit: status.limit,
        highPriorityPerMinute: status.highPriorityPerMinute,
        usage: status.usage,
        currentUsage: status.currentUsage,
        windowMs: status.windowMs,
        resetsInSeconds: status.resetsInSeconds,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to get rate limit" },
      { status: 400 },
    )
  }
}
