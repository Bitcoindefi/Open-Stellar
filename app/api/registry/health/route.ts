import { NextResponse } from "next/server"
import { listAgentsForSweep } from "@/lib/agent-registry"
import { computeSweep } from "@/lib/registry/sweep"

export const dynamic = "force-dynamic"

/**
 * GET /api/registry/health (issue #193)
 *
 * Runs a request-time sweep (no cron) and returns registry health counts.
 */
export async function GET() {
  const agents = listAgentsForSweep()
  let offline = 0

  const sweep = computeSweep(
    agents,
    (agentId) => {
      offline += 1
      void agentId
    },
    () => {},
  )

  const online = agents.length - sweep.markedOffline.length - sweep.removed.length

  return NextResponse.json(
    {
      ok: true,
      online,
      offline,
      stale_removed_last_run: sweep.removed.length,
      removed: sweep.removed,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
