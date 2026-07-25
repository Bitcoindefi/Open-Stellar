import { NextResponse } from "next/server"
import { runXpDecayCron } from "@/lib/agents/xp-decay"
import { createApiRouteLogger } from "@/lib/api-logging"

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/cron/xp-decay")

  if (!isCronAuthorized(req)) {
    return await api.json(
      { ok: false, error: "Unauthorized cron request" },
      { status: 401 },
      { reason: "unauthorized_cron" },
    )
  }

  try {
    const result = runXpDecayCron()

    return await api.json(
      {
        ok: true,
        processed: result.processed,
        decayed: result.decayed,
        skipped: result.skipped,
      },
      { headers: { "Cache-Control": "no-store" } },
      {
        event: "xp.decay.cron.completed",
        processed: result.processed,
        decayed: result.decayed,
        skipped: result.skipped,
      },
    )
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed running XP decay" },
      { status: 500 },
      { event: "xp.decay.cron.failed" },
    )
  }
}