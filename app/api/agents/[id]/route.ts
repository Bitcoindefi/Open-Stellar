import { NextResponse } from "next/server"
import { deregisterAgent, getRegisteredAgent } from "@/lib/agent-registry"
import { listAgentTasks } from "@/lib/agents/task-queue"
import { getAgentXP } from "@/lib/gamification/xp"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agent = getRegisteredAgent(decodeURIComponent(id))

  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  const progress = getAgentXP(agent.agentId)
  const tasksCompleted = listAgentTasks(agent.agentId)
    .filter((task) => task.status === "completed")
    .length

  return NextResponse.json(
    { ok: true, agent: { ...agent, ...progress, tasksCompleted } },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agent = deregisterAgent(decodeURIComponent(id))

  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  return NextResponse.json(
    { ok: true, agent },
    { headers: { "Cache-Control": "no-store" } },
  )
}
