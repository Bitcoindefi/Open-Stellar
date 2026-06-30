import { NextResponse } from "next/server"
import { listCapabilities } from "@/lib/agent-registry"

export const dynamic = "force-dynamic"

export async function GET() {
  const capabilities = listCapabilities()
  return NextResponse.json(
    { ok: true, capabilities },
    { headers: { "Cache-Control": "no-store" } },
  )
}
