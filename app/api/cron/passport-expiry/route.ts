import { NextResponse } from "next/server"
import { runPassportExpiryCheck, listPassportExpiryEvents } from "@/lib/passport/passport-store"
import { createApiRouteLogger } from "@/lib/api-logging"

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, "/api/cron/passport-expiry")

  if (!isCronAuthorized(req)) {
    return await api.json(
      { ok: false, error: "Unauthorized cron request" },
      { status: 401 },
      { reason: "unauthorized_cron" },
    )
  }

  try {
    const result = runPassportExpiryCheck()

    return await api.json(
      {
        ok: true,
        expired: result.expiredCount,
        checkedAt: result.checkedAt,
        checkedCount: result.checkedCount,
      },
      { headers: { "Cache-Control": "no-store" } },
      {
        event: "passport.expiry.cron.completed",
        expiredCount: result.expiredCount,
        checkedCount: result.checkedCount,
      },
    )
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed running passport expiry check" },
      { status: 500 },
      { event: "passport.expiry.cron.failed" },
    )
  }
}