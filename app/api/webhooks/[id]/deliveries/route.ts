import { NextResponse } from "next/server"
import { listWebhookDeliveryAttempts } from "@/lib/webhooks/delivery-log"
import { registerWebhookDeliveryListener } from "@/lib/webhooks/delivery"
import { listWebhooks } from "@/lib/webhooks/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

registerWebhookDeliveryListener()

type RouteContext = {
  params: Promise<{ id: string }>
}

function parseLimit(req: Request): number {
  const limit = new URL(req.url).searchParams.get("limit")
  if (!limit) return 20

  const parsed = Number.parseInt(limit, 10)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(Math.max(parsed, 1), 200)
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  const webhookId = decodeURIComponent(id)
  const exists = listWebhooks().some((webhook) => webhook.id === webhookId)

  if (!exists) {
    return NextResponse.json(
      { ok: false, error: "Webhook not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.json(
    { deliveries: listWebhookDeliveryAttempts(webhookId, parseLimit(req)) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
