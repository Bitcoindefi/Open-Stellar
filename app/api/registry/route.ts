import { NextResponse } from "next/server"
import { listRegisteredAgents } from "@/lib/agent-registry"
import { getAgentHealthSummary } from "@/lib/agents/agent-error-store"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const agents = listRegisteredAgents({
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
  return NextResponse.json(
    { ok: true, agents },
    { headers: { "Cache-Control": "no-store" } },
  )
}
