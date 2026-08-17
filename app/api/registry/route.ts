import { NextResponse } from "next/server"
import { listRegisteredAgents } from "@/lib/agent-registry"
import { hasValidAdminToken } from "@/lib/admin-token"
import { getAgentHealthSummary } from "@/lib/agents/agent-error-store"
import { getAgentHealth } from "@/lib/agents/agent-health-store"
import { getAgentXP } from "@/lib/gamification/xp"
import { getReputation } from "@/lib/reputation/reputation-store"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  if (!hasValidAdminToken(req.headers)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

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
  const items = agents.map((agent) => {
    const health = getAgentHealth(agent.agentId)
    const xp = getAgentXP(agent.agentId)
    const reputation = getReputation(agent.agentId)

    return {
      ...agent,
      name: agent.name ?? agent.agentId,
      status: health?.runtimeStatus ?? agent.status,
      xp: xp.xp,
      level: xp.level,
      tasksCompleted: reputation.metrics.tasksCompleted,
      lastSeen: health?.lastHeartbeat ?? agent.updatedAt,
    }
  })
  return NextResponse.json(
    { ok: true, agents: items },
    { headers: { "Cache-Control": "no-store" } },
  )
}
