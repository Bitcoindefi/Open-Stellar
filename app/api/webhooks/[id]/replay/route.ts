import { NextResponse } from "next/server"
import { registerWebhookDeliveryListener, replayEventsToWebhook } from "@/lib/webhooks/delivery"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

registerWebhookDeliveryListener()

type RouteContext = {
  params: Promise<{ id: string }>
}

function parseIsoTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const from = parseIsoTimestamp(body.from)
  const to = body.to === undefined ? new Date() : parseIsoTimestamp(body.to)

  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: "from and to must be ISO timestamps" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  if (from.getTime() > to.getTime()) {
    return NextResponse.json(
      { ok: false, error: "from must be before or equal to to" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  const queued = await replayEventsToWebhook(decodeURIComponent(id), from, to)
  if (queued === null) {
    return NextResponse.json(
      { ok: false, error: "Webhook not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.json(
    { ok: true, queued },
    { headers: { "Cache-Control": "no-store" } },
  )
}
