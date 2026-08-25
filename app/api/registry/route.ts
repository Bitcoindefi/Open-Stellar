import { NextResponse } from "next/server"
import { listRegisteredAgents, markAgentOffline, deregisterAgent, listAgentsForSweep } from "@/lib/agent-registry"
import { getAgentHealthSummary } from "@/lib/agents/agent-error-store"
import { computeSweep } from "@/lib/registry/sweep"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)

  // Request-time sweep (issue #193): no cron needed; stale agents are removed
  // and briefly-unseen ones marked offline before listing.
  computeSweep(
    listAgentsForSweep(),
    (id) => markAgentOffline(id),
    (id) => deregisterAgent(id),
  )
  const agents = listRegisteredAgents({
    status: url.searchParams.get("status") ?? undefined,
    capability: url.searchParams.get("capability") ?? undefined,
  }).map((agent) => {
    const health = getAgentHealthSummary(agent.agentId)
    return {
      ...agent,
      status: health.degraded ? "degraded" as const : agent.status,
      errorCount24h: health.errorCount24h,
      degraded: health.degraded,
    }
  })
  const statusFilter = url.searchParams.get("status") ?? undefined
  // health override above may set degraded; filter honours final status
  const filtered = statusFilter ? agents.filter((a) => a.status === statusFilter) : agents
  return NextResponse.json(
    { ok: true, agents: filtered },
    { headers: { "Cache-Control": "no-store" } },
  )
}
