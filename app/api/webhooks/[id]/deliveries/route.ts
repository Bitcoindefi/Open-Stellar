import { NextResponse } from "next/server"
import { listWebhookDeliveryAttempts, listWebhookDeliveries } from "@/lib/webhooks/delivery-log"
import { registerWebhookDeliveryListener } from "@/lib/webhooks/delivery"
import { getWebhookById } from "@/lib/webhooks/store"

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

  const webhook = getWebhookById(webhookId)
  if (!webhook) {
    return NextResponse.json(
      { ok: false, error: "Webhook not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  const url = new URL(req.url)
  const statusParam = url.searchParams.get("status")
  const limit = parseLimit(req)

  // NEW: When status filter is provided, return the DeliveryListItem shape
  if (statusParam === "success" || statusParam === "failure") {
    return NextResponse.json(
      { deliveries: listWebhookDeliveries(webhookId, { status: statusParam, limit }) },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  // DEFAULT: Return the original WebhookDeliveryAttempt shape for backward compatibility
  return NextResponse.json(
    { deliveries: listWebhookDeliveryAttempts(webhookId, limit) },
    { headers: { "Cache-Control": "no-store" } },
  )
}