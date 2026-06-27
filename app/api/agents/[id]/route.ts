import { NextResponse } from "next/server"
import { deregisterAgent, getRegisteredAgent } from "@/lib/agent-registry"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agent = getRegisteredAgent(decodeURIComponent(id))

  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  return NextResponse.json(
    { ok: true, agent },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agent = deregisterAgent(decodeURIComponent(id))

  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  return NextResponse.json(
    { ok: true, agent },
    { headers: { "Cache-Control": "no-store" } },
  )
}
