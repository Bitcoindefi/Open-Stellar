import { NextResponse } from "next/server"
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/event-types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json(
    { eventTypes: [...WEBHOOK_EVENT_TYPES] },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  )
}
