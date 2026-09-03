import { NextResponse } from "next/server"
import {
  getAgentLeaderboard,
  type AgentLeaderboardMetric,
} from "@/lib/leaderboard/agent-leaderboard"

export const dynamic = "force-dynamic"

function parseMetric(value: string | null): AgentLeaderboardMetric {
  if (value === null || value === "") return "xp"
  if (value === "xp" || value === "quests" || value === "districts") return value
  throw new Error("metric must be one of: xp, quests, districts")
}

/**
 * GET /api/agents-leaderboard?limit=20&metric=xp   (issue #313)
 *
 * Ranks all registered agents by xp | quests | districts. Cached 60 s;
 * invalidated by quest completion or XP awards.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)

  let limit = 20
  const limitParam = url.searchParams.get("limit")
  if (limitParam !== null && limitParam !== "") {
    limit = Number(limitParam)
    if (!Number.isInteger(limit) || limit < 1) {
      return NextResponse.json(
        { ok: false, error: "limit must be a positive integer" },
        { status: 400 },
      )
    }
    if (limit > 100) {
      return NextResponse.json(
        { ok: false, error: "Bad Request: Limit cannot exceed 100" },
        { status: 400 },
      )
    }
  }

  try {
    const metric = parseMetric(url.searchParams.get("metric"))
    const result = getAgentLeaderboard({ limit, metric })
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "invalid request" },
      { status: 400 },
    )
  }
}

