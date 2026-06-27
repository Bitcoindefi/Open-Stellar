import { NextResponse } from "next/server"
import { processDueWebhookRetries } from "@/lib/webhooks/delivery"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

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
