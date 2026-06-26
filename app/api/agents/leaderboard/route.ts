import { NextResponse } from "next/server"
import { listAgentHealth } from "@/lib/agents/agent-health-store"
import { getAgentXP } from "@/lib/gamification/xp"
import { getReputation } from "@/lib/reputation/reputation-store"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  
  const sort = url.searchParams.get("sort") || "xp"
  const limitParam = url.searchParams.get("limit")
  const offsetParam = url.searchParams.get("offset")
  
  let limit = 20
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed > 0) {
      limit = parsed
    }
  }
  
  if (limit > 100) {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 })
  }
  
  let offset = 0
  if (offsetParam !== null) {
    const parsed = parseInt(offsetParam, 10)
    if (!isNaN(parsed) && parsed >= 0) {
      offset = parsed
    }
  }
  
  const healthRecords = listAgentHealth()
  const agents = healthRecords.map(record => {
    const agentId = record.agentId
    const xpRecord = getAgentXP(agentId)
    const reputationRecord = getReputation(agentId)
    
    return {
      agentId,
      xp: xpRecord.xp,
      reputation: reputationRecord.score,
      taskCount: reputationRecord.metrics.tasksCompleted,
      rank: 0,
    }
  })
  
  agents.sort((a, b) => {
    if (sort === "reputation") {
      return b.reputation - a.reputation || a.agentId.localeCompare(b.agentId)
    } else if (sort === "tasks") {
      return b.taskCount - a.taskCount || a.agentId.localeCompare(b.agentId)
    } else {
      return b.xp - a.xp || a.agentId.localeCompare(b.agentId)
    }
  })
  
  agents.forEach((agent, index) => {
    agent.rank = index + 1
  })
  
  const total = agents.length
  const paginatedAgents = agents.slice(offset, offset + limit)
  
  return NextResponse.json(
    {
      agents: paginatedAgents,
      total,
      limit,
      offset
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
