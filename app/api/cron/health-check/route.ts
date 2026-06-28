import { NextResponse } from "next/server"
import { listAgentHealth, listAgentHealthEvents, runAgentHealthCheck } from "@/lib/agents/agent-health-store"
import { isCronAuthorized } from "@/lib/auth"

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request" }, { status: 401 })
  }

  const result = runAgentHealthCheck()

  return NextResponse.json(
    {
      ok: true,
      ...result,
      agents: listAgentHealth(),
      recentEvents: listAgentHealthEvents(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
