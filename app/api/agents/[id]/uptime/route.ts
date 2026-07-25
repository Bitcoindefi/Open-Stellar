import { NextResponse } from "next/server"
import { getAgentUptime } from "@/lib/agents/agent-uptime-store"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const uptime = getAgentUptime(agentId)

  if (!uptime) {
    return NextResponse.json(
      { ok: false, error: "No uptime recorded for agent", agentId },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.json(
    {
      agentId: uptime.agentId,
      uptimeDays: uptime.uptimeDays,
      firstSeenAt: uptime.firstSeenAt,
      lastSeenAt: uptime.lastSeenAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
