import { NextResponse } from "next/server"
import { getOrCreateAgent, listAgentTaskRecords, normalizeTaskInput } from "@/lib/agent-runtime/agent"
import { findAgentByLookup } from "@/lib/og-card-data"

interface RouteContext {
  params: Promise<{ id: string }>
}

function getRuntimeAgent(id: string) {
  const displayAgent = findAgentByLookup(id)
  return getOrCreateAgent({
    id: displayAgent?.id ?? id,
    name: displayAgent?.name ?? id,
    model: displayAgent?.model ?? "claude/runtime-delegated",
    district: displayAgent?.district,
    cpu: displayAgent?.cpu,
    memory: displayAgent?.memory,
    autoRestart: displayAgent?.autoRestart,
  })
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const agent = getRuntimeAgent(agentId)

  return NextResponse.json(
    { ok: true, tasks: listAgentTaskRecords(agent.id) },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)
    const body = await req.json().catch(() => ({}))
    const agent = getRuntimeAgent(agentId)
    await agent.start()
    const result = await agent.executeTask(normalizeTaskInput(body))

    return NextResponse.json(
      { ok: true, result },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed executing agent task" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }
}
