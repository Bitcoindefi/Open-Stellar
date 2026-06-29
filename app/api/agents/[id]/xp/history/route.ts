import { NextResponse } from "next/server"
import { getAgentXpHistory, type XpHistoryEvent } from "@/lib/agents/xp-decay"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

function parsePositiveInteger(value: string | null, field: string, fallback: number): number {
  if (value === null || value.trim() === "") return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${field} must be a positive integer`)
  }
  return parsed
}

function parseType(value: string | null): XpHistoryEvent["type"] | undefined {
  if (value === null || value.trim() === "") return undefined
  if (value !== "earned" && value !== "decayed") {
    throw new Error("type must be one of: earned, decayed")
  }
  return value
}

function parseDateBoundary(value: string | null, field: "from" | "to"): number | undefined {
  if (value === null || value.trim() === "") return undefined

  const clean = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const iso = field === "from" ? `${clean}T00:00:00.000Z` : `${clean}T23:59:59.999Z`
    return new Date(iso).getTime()
  }

  const parsed = new Date(clean).getTime()
  if (Number.isNaN(parsed)) {
    throw new Error(`${field} must be a valid ISO date or YYYY-MM-DD`)
  }
  return parsed
}

function matchesDateRange(event: XpHistoryEvent, from?: number, to?: number): boolean {
  const timestamp = new Date(event.timestamp).getTime()
  if (from !== undefined && timestamp < from) return false
  if (to !== undefined && timestamp > to) return false
  return true
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)
    const url = new URL(req.url)
    const page = parsePositiveInteger(url.searchParams.get("page"), "page", 1)
    const pageSize = parsePositiveInteger(url.searchParams.get("pageSize"), "pageSize", 20)

    if (pageSize > 100) {
      return NextResponse.json(
        { ok: false, error: "pageSize must be less than or equal to 100" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const type = parseType(url.searchParams.get("type"))
    const from = parseDateBoundary(url.searchParams.get("from"), "from")
    const to = parseDateBoundary(url.searchParams.get("to"), "to")

    if (from !== undefined && to !== undefined && from > to) {
      return NextResponse.json(
        { ok: false, error: "from must be before or equal to to" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const allEvents = getAgentXpHistory(agentId)
    const filtered = allEvents
      .filter((event) => !type || event.type === type)
      .filter((event) => matchesDateRange(event, from, to))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const start = (page - 1) * pageSize

    return NextResponse.json(
      {
        agentId,
        totalXp: allEvents.reduce((sum, event) => sum + event.delta, 0),
        events: filtered.slice(start, start + pageSize),
        page,
        pageSize,
        total: filtered.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed listing XP history" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }
}
