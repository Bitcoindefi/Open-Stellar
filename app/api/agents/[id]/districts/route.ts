import { NextResponse } from "next/server"
import { getDistrictUnlockMap } from "@/lib/districts/district-unlock-store"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/agents/[id]/districts   (issue #300)
 *
 * Progress toward each district unlock threshold:
 * { unlocked: DistrictId[], progress: [{ district, required, current, pct }] }
 */
export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const result = getDistrictUnlockMap(decodeURIComponent(id))

  const unlocked = result.districts
    .filter((d) => d.status === "unlocked")
    .map((d) => d.id)

  const progress = result.districts
    .filter((d): d is Extract<typeof d, { status: "locked" }> => d.status === "locked")
    .map((d) => ({
      district: d.id,
      required: d.xpRequired,
      current: d.xpCurrent,
      pct: Math.max(0, Math.min(100, Math.floor((d.xpCurrent / d.xpRequired) * 100))),
    }))

  return NextResponse.json(
    { ok: true, agentId: result.agentId, unlocked, progress },
    { headers: { "Cache-Control": "no-store" } },
  )
}
