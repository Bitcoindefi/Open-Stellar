import { NextResponse } from "next/server"
import { createSystemEventResponse } from "@/lib/events/event-stream"
import { listRegisteredAgents, registerAgent } from "@/lib/agent-registry"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)

  if (url.searchParams.get("stream") === "1") {
    return createSystemEventResponse()
  }

  const agents = listRegisteredAgents({
    district: url.searchParams.get("district") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    skill: url.searchParams.get("skill") ?? undefined,
  })

  return NextResponse.json(
    { ok: true, agents },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: Request) {
  try {
    const agent = registerAgent(await req.json())
    return NextResponse.json(
      { ok: true, agent },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed registering agent" },
      { status: 400 },
    )
  }
}
