import { NextResponse } from "next/server"
import { createApiRouteLogger } from "@/lib/api-logging"
import { getPassportExpiryStats, listPassportExpiryEvents } from "@/lib/passport/passport-store"

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, "/api/protocol/passport/health")

  try {
    const stats = getPassportExpiryStats()
    const recentEvents = listPassportExpiryEvents(20)

    return await api.json(
      {
        ok: true,
        stats,
        recentEvents,
      },
      { headers: { "Cache-Control": "no-store" } },
      {
        event: "passport.health.read",
        totalPassports: stats.total,
        active: stats.active,
        revoked: stats.revoked,
      },
    )
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed reading passport health" },
      { status: 500 },
      { event: "passport.health.failed" },
    )
  }
}