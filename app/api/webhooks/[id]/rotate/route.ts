import { NextResponse } from "next/server"
import { cancelPendingWebhookRetries, registerWebhookDeliveryListener } from "@/lib/webhooks/delivery"
import { removePendingWebhookRetries } from "@/lib/webhooks/retry-store"
import { rotateWebhookSecret } from "@/lib/webhooks/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

registerWebhookDeliveryListener()

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const webhook = rotateWebhookSecret(decodeURIComponent(id))

  if (!webhook) {
    return NextResponse.json(
      { ok: false, error: "Webhook not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  const cancelledRetries = cancelPendingWebhookRetries(webhook.id) + removePendingWebhookRetries(webhook.id)

  return NextResponse.json(
    { id: webhook.id, secret: webhook.secret, cancelledRetries },
    { headers: { "Cache-Control": "no-store" } },
  )
}
