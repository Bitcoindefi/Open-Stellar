import { NextResponse } from "next/server"
import { deleteWebhook } from "@/lib/webhooks/store"

export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const deleted = deleteWebhook(decodeURIComponent(id))

  return NextResponse.json(
    { ok: true, deleted },
    { headers: { "Cache-Control": "no-store" } },
  )
}
