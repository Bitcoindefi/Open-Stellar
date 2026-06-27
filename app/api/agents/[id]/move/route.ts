import { NextResponse } from "next/server"
import { moveAgentPosition } from "@/lib/agents/agent-position-store"
import { isAuthorized } from "@/lib/auth"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, context: RouteContext) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await context.params
    const position = moveAgentPosition(decodeURIComponent(id), await req.json())

    return NextResponse.json(
      { ok: true, position },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed moving agent" },
      { status: 400 },
    )
  }
}
