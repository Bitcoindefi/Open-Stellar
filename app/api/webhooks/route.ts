import { NextResponse } from "next/server"
import { createWebhookRegistration, listWebhooks } from "@/lib/webhooks/store"
import { registerWebhookDeliveryListener } from "@/lib/webhooks/delivery"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

registerWebhookDeliveryListener()

export async function GET() {
  return NextResponse.json(
    { webhooks: listWebhooks() },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  try {
    const webhook = createWebhookRegistration({
      url: body.url,
      events: body.events,
    })
    return NextResponse.json(
      { id: webhook.id, secret: webhook.secret },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid webhook registration" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }
}
