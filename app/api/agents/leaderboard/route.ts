import { NextResponse } from "next/server"
import { listAgentHealth } from "@/lib/agents/agent-health-store"
import { getAgentXP } from "@/lib/gamification/xp"
import { getReputation } from "@/lib/reputation/reputation-store"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    
    const sort = searchParams.get("sort") ?? "xp"
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    
    let limit = limitParam ? parseInt(limitParam, 10) : 20
    if (isNaN(limit) || limit < 1) limit = 20
    if (limit > 100) {
      return NextResponse.json(
        { error: "Bad Request: Limit cannot exceed 100" },
        { status: 400 }
      )
    }
    
    let offset = offsetParam ? parseInt(offsetParam, 10) : 0
    if (isNaN(offset) || offset < 0) offset = 0
    
    const agentsHealth = listAgentHealth()
    
    let agents = agentsHealth.map(health => {
      const agentId = health.agentId
      const xpData = getAgentXP(agentId)
      const repData = getReputation(agentId)
      
      return {
        agentId,
        xp: xpData.xp,
        reputation: repData.score,
        taskCount: repData.metrics.tasksCompleted
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
    
    agents = agents.map((agent, index) => ({
      ...agent,
      rank: index + 1
    }))
    
    const total = agents.length
    const paginatedAgents = agents.slice(offset, offset + limit)
    
    return NextResponse.json(
      { agents: paginatedAgents, total, limit, offset },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch leaderboard" },
      { status: 500 }
    )
  }
}
