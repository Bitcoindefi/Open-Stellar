import { NextResponse } from "next/server"
import { processDueWebhookRetries } from "@/lib/webhooks/delivery"
import { isCronAuthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const summary = await processDueWebhookRetries()
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } })
}
