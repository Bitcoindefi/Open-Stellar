import { NextResponse } from "next/server"
import { getWebhookDeliveryStats } from "@/lib/webhooks/delivery-log"
import { getWebhookById } from "@/lib/webhooks/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const webhookId = decodeURIComponent(id)

  const webhook = getWebhookById(webhookId)
  if (!webhook) {
    return NextResponse.json(
      { ok: false, error: "Webhook not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  const stats = getWebhookDeliveryStats(webhookId)

  return NextResponse.json(stats, {
    headers: { "Cache-Control": "no-store" },
  })
}