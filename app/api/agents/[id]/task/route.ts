import { NextResponse } from "next/server"
import { getOrCreateAgent, listAgentTaskRecords, normalizeTaskInput } from "@/lib/agent-runtime/agent"
import { checkRateLimit } from "@/lib/agents/rate-limit-middleware"
import { findAgentByLookup } from "@/lib/og-card-data"

interface RouteContext {
  params: Promise<{ id: string }>
}

function getRuntimeAgent(id: string) {
  const displayAgent = findAgentByLookup(id)
  if (!displayAgent) {
    if (!/^bot-\d+$/.test(id)) return null
    return getOrCreateAgent({
      id,
      name: id,
      model: "claude/runtime-delegated",
    })
  }
  return getOrCreateAgent({
    id: displayAgent.id,
    name: displayAgent.name,
    model: displayAgent.model,
    district: displayAgent.district,
    cpu: displayAgent.cpu,
    memory: displayAgent.memory,
    autoRestart: displayAgent.autoRestart,
  })
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const agent = getRuntimeAgent(agentId)
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "agent_not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

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
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "agent_not_found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      )
    }
    const rateLimit = checkRateLimit(agentId)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limit_exceeded" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(Math.ceil((rateLimit.retryAfterMs ?? 1000) / 1000)),
          },
        },
      )
    }

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
