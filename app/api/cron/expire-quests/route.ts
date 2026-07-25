import { NextResponse } from "next/server"
import { runQuestExpiryCheck } from "@/lib/gamification/quest-store"
import { createApiRouteLogger } from "@/lib/api-logging"

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, "/api/cron/expire-quests")

  if (!isCronAuthorized(req)) {
    return await api.json(
      { ok: false, error: "Unauthorized cron request" },
      { status: 401 },
      { reason: "unauthorized_cron" },
    )
  }

  try {
    const result = runQuestExpiryCheck()

    return await api.json(
      {
        ok: true,
        expired: result.expired,
        checked: result.checked,
        notified: result.notified,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
      {
        event: "quests.expiry.cron.completed",
        expiredCount: result.expired,
        checkedCount: result.checked,
        notifiedCount: result.notified,
      },
    )
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed running quest expiry check" },
      { status: 500 },
      { event: "quests.expiry.cron.failed" },
    )
  }
}