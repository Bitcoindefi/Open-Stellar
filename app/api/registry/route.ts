import { NextResponse } from "next/server"
import { listRegisteredAgents } from "@/lib/agent-registry"
import { getAgentHealth } from "@/lib/agents/agent-health-store"
import { getAgentXP } from "@/lib/gamification/xp"
import { getReputation } from "@/lib/reputation/reputation-store"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const agents = listRegisteredAgents({
    capability: url.searchParams.get("capability") ?? undefined,
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
