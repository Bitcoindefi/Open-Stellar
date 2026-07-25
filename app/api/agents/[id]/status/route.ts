import { NextResponse } from "next/server"
import { getOrCreateAgent } from "@/lib/agent-runtime/agent"
import { getAgentHealth } from "@/lib/agents/agent-health-store"
import { findAgentByLookup } from "@/lib/og-card-data"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const displayAgent = findAgentByLookup(agentId)
  const agent = getOrCreateAgent({
    id: displayAgent?.id ?? agentId,
    name: displayAgent?.name ?? agentId,
    model: displayAgent?.model ?? "claude/runtime-delegated",
    district: displayAgent?.district,
    cpu: displayAgent?.cpu,
    memory: displayAgent?.memory,
    autoRestart: displayAgent?.autoRestart,
  })
  const health = getAgentHealth(agent.id)

  return NextResponse.json(
    {
      ok: true,
      agentId: agent.id,
      status: agent.getStatus(),
      metrics: agent.getMetrics(),
      health,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
