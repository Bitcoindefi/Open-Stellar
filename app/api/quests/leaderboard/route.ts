import { NextResponse } from "next/server"
import { createApiRouteLogger } from "@/lib/api-logging"
import { getQuestLeaderboard, type LeaderboardPeriod } from "@/lib/gamification/quest-leaderboard"

const VALID_PERIODS: LeaderboardPeriod[] = ["daily", "weekly"]

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, "/api/quests/leaderboard")

  try {
    const url = new URL(req.url)
    const rawPeriod = url.searchParams.get("period")
    const period: LeaderboardPeriod =
      rawPeriod && VALID_PERIODS.includes(rawPeriod as LeaderboardPeriod)
        ? (rawPeriod as LeaderboardPeriod)
        : "weekly"

    const entries = getQuestLeaderboard(period)

    return await api.json(
      {
        ok: true,
        period,
        entries,
        count: entries.length,
      },
      { headers: { "Cache-Control": "no-store" } },
      {
        event: "quest.leaderboard.read",
        period,
        entryCount: entries.length,
      },
    )
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed reading quest leaderboard" },
      { status: 500 },
      { event: "quest.leaderboard.failed" },
    )
  }
}