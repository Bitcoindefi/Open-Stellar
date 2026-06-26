import { NextResponse } from "next/server"
import { updateAgentCapabilities } from "@/lib/agent-registry"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PUT(req: Request, context: RouteContext) {
  const { id } = await context.params

  try {
    const agent = updateAgentCapabilities(decodeURIComponent(id), await req.json())
    return NextResponse.json(
      { ok: true, agent },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed updating capabilities"
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "agent not found" ? 404 : 400 },
    )
  }
}
