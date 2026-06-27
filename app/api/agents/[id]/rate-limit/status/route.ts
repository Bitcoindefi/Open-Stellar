import { NextResponse } from "next/server"
import { getRateLimitStatus } from "@/lib/agents/rate-limit-store"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const status = getRateLimitStatus(agentId)

  return NextResponse.json(
    { ok: true, agentId, status },
    { headers: { "Cache-Control": "no-store" } },
  )
}
