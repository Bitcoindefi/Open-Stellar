import { NextResponse } from "next/server"
import { recordAgentHeartbeat } from "@/lib/agent-registry"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agent = recordAgentHeartbeat(decodeURIComponent(id))

  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "agent not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.json(
    { ok: true, agent },
    { headers: { "Cache-Control": "no-store" } },
  )
}
