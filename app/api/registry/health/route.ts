import { NextResponse } from "next/server"
import { getAgentRegistryHealth } from "@/lib/agent-registry"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(
    getAgentRegistryHealth(),
    { headers: { "Cache-Control": "no-store" } },
  )
}
