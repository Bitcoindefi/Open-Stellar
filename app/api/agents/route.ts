import { NextResponse } from "next/server"
import { createSystemEventResponse } from "@/lib/events/event-stream"
import { listRegisteredAgents, registerAgent } from "@/lib/agent-registry"
import { getAgentHealth } from "@/lib/agents/agent-health-store"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)

  if (url.searchParams.get("stream") === "1") {
    return createSystemEventResponse()
  }

  const q = url.searchParams.get("q")?.toLowerCase()
  const capability = url.searchParams.get("capability")
  const statusFilter = url.searchParams.get("status")
  const tag = url.searchParams.get("tag")

  let agents = listRegisteredAgents({
    district: url.searchParams.get("district") ?? undefined,
    skill: url.searchParams.get("skill") ?? undefined,
  })

  agents = agents.filter(agent => {
    if (q) {
      const idMatch = agent.agentId.toLowerCase().includes(q)
      const nameMatch = (agent as any).name?.toLowerCase().includes(q) || false
      if (!idMatch && !nameMatch) return false
    }

    if (capability) {
      if (!agent.capabilities?.includes(capability)) return false
    }

    if (tag) {
      if (!agent.tags?.includes(tag)) return false
    }

    if (statusFilter) {
      const health = getAgentHealth(agent.agentId)
      const currentStatus = health?.status || "offline"
      
      if (statusFilter === 'active') {
        if (currentStatus !== 'healthy' && currentStatus !== 'stale') return false
      } else {
        if (currentStatus !== statusFilter) return false
      }
    }

    return true
  })

  return NextResponse.json(
    { ok: true, agents },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: Request) {
  try {
    const agent = registerAgent(await req.json())
    return NextResponse.json(
      { ok: true, agent },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed registering agent" },
      { status: 400 },
    )
  }
}
