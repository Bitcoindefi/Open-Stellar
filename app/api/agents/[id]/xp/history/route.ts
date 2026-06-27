import { NextResponse } from "next/server"
import { getAgentXpHistory } from "@/lib/agents/xp-decay"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  const events = getAgentXpHistory(agentId)

  return NextResponse.json({
    agentId,
    events,
  })
}