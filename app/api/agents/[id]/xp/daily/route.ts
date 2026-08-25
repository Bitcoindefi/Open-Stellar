import { NextResponse } from "next/server"
import { getAgentXPHistory } from "@/lib/gamification/xp-store"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/agents/[id]/xp/daily
 *
 * Daily XP snapshots for charting (issue #191). Returns at least the last 7
 * days when history exists, oldest first: { date, agentId, xpGained, totalXp }.
 */
export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  const history = getAgentXPHistory(agentId)
  return NextResponse.json(
    { ok: true, agentId, days: history.length >= 7 ? history.length : Math.max(history.length, 0), history },
    { headers: { "Cache-Control": "no-store" } },
  )
}
