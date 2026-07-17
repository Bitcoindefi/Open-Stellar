import { NextResponse } from "next/server"
import { getAgentHealthSummary } from "@/lib/agents/agent-error-store"
import { isAuthorized } from "@/lib/auth"

interface RouteContext {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

export async function GET(req: Request, context: RouteContext) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  return NextResponse.json(
    getAgentHealthSummary(decodeURIComponent(id)),
    { headers: { "Cache-Control": "no-store" } },
  )
}
