import { NextResponse } from "next/server"

import { deregisterAgent, getRegisteredAgent, updateAgentStatus } from "@/lib/agent-registry"

interface RouteContext {
  params: Promise<{ id: string }>
}

interface UpdateRegistryBody {
  status?: unknown
}

async function readBody(req: Request): Promise<UpdateRegistryBody> {
  try {
    const body = await req.json()
    return typeof body === "object" && body !== null ? (body as UpdateRegistryBody) : {}
  } catch {
    return {}
  }
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agent = getRegisteredAgent(decodeURIComponent(id))

  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, agent }, { headers: { "Cache-Control": "no-store" } })
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const body = await readBody(req)

  if (body.status !== "offline") {
    return NextResponse.json({ ok: false, error: 'status must be "offline"' }, { status: 400 })
  }

  try {
    const agent = updateAgentStatus(agentId, "offline")
    return NextResponse.json({ ok: true, agent }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "failed updating agent" },
      { status: 404 },
    )
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agent = deregisterAgent(decodeURIComponent(id))

  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, agent }, { headers: { "Cache-Control": "no-store" } })
}
