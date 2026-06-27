import { NextResponse } from "next/server"
import { getLeaderboard, type LeaderboardWindow } from "@/lib/agents/xp-leaderboard-store"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const window = (searchParams.get("window") ?? "all") as LeaderboardWindow
    const limit = searchParams.get("limit")

    const result = getLeaderboard(
      window,
      limit ? Number(limit) : undefined,
    )

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch leaderboard" },
      { status: 500 },
    )
  }
}