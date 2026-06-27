import { NextResponse } from "next/server"
import {
  getAgentPositionHistoryPaginated,
} from "@/lib/agents/agent-position-store"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseLimit(value: string | null): number {
  if (value === null || !value.trim()) {
    return 50
  }

  const num = Number(value)
  if (!Number.isFinite(num)) {
    return 50
  }

  return Math.max(1, Math.min(Math.trunc(num), 1000))
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const url = new URL(req.url)

    const limit = parseLimit(url.searchParams.get("limit"))
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