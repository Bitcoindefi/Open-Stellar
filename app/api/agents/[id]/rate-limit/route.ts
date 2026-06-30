import { NextResponse } from "next/server"
import { getHighPriorityRateLimitStatus } from "@/lib/agents/high-priority-rate-limit-store"

interface RouteContext {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  const status = getHighPriorityRateLimitStatus(agentId)

  return NextResponse.json(
    {
      ok: true,
      agentId: status.agentId,
      limit: status.limit,
      usage: status.usage,
      windowMs: status.windowMs,
      resetsAt: status.resetsAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

