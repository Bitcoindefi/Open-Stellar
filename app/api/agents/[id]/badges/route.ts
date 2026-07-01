import { NextResponse } from "next/server"

import { checkAndAwardBadges, getAgentBadges } from "@/lib/agents/badges"
import { getRegisteredAgent } from "@/lib/agent-registry"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  const agent = getRegisteredAgent(agentId)
  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  checkAndAwardBadges(agentId)
  const badges = getAgentBadges(agentId)

  return NextResponse.json(
    { badges, count: badges.length },
    { headers: { "Cache-Control": "no-store" } },
  )
}
