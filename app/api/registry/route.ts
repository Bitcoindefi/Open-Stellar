import { NextResponse } from "next/server"
import { listRegisteredAgents } from "@/lib/agent-registry"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const agents = listRegisteredAgents({
    capability: url.searchParams.get("capability") ?? undefined,
  })
  return NextResponse.json(
    { ok: true, agents },
    { headers: { "Cache-Control": "no-store" } },
  )
}
