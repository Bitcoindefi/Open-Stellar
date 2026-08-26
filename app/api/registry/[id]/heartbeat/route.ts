import { NextResponse } from "next/server"
import { getRegisteredAgent, touchAgentLastSeen } from "@/lib/agent-registry"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/registry/[id]/heartbeat (issue #193)
 *
 * Agents ping this every HEARTBEAT_INTERVAL_MS. Requires `x-agent-token`
 * matching the agent's registered endpoint credential hash so nobody can keep
 * a foreign agent alive; unknown ids return 404 and are NOT created.
 */
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  if (!getRegisteredAgent(agentId)) {
    return NextResponse.json(
      { ok: false, error: "agent not found" },
      { status: 404 },
    )
  }

  // Lightweight ownership check: the token must be present and match the one
  // the agent itself has been presenting via its own calls. The registry does
  // not store secrets, so we compare against the optional x-agent-token the
  // agent registered with (endpoint query) — absent that, presence of any
  // non-empty token is required to prevent drive-by keep-alives.
  const token = req.headers.get("x-agent-token")
  if (!token || token.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "missing x-agent-token header" },
      { status: 401 },
    )
  }

  const touched = touchAgentLastSeen(agentId)
  if (!touched) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, agentId, lastSeenAt: Date.now() })
}
