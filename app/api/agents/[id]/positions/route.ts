import { NextResponse } from "next/server"
import {
  getAgentPositionHistoryPaginated,
  getApiMaxLimit,
} from "@/lib/agents/agent-position-store"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseLimit(value: string | null): { limit: number; error?: string } {
  if (value === null || !value.trim()) {
    return { limit: 50 }
  }

  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) {
    return { limit: 50, error: "limit must be a positive integer" }
  }
  if (num > getApiMaxLimit()) {
    return { limit: 50, error: `limit must be at most ${getApiMaxLimit()}` }
  }

  return { limit: Math.trunc(num) }
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const url = new URL(req.url)

    const { limit, error: limitError } = parseLimit(url.searchParams.get("limit"))
    if (limitError) {
      return NextResponse.json(
        { ok: false, error: limitError },
        { status: 400 },
      )
    }

    const before = url.searchParams.get("before")
    const after = url.searchParams.get("after")

    const result = getAgentPositionHistoryPaginated(decodeURIComponent(id), {
      limit,
      before,
      after,
    })

    return NextResponse.json(
      {
        ok: true,
        positions: result.positions,
        total: result.total,
        returned: result.returned,
        oldest: result.oldest,
        newest: result.newest,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed listing positions" },
      { status: 400 },
    )
  }
}