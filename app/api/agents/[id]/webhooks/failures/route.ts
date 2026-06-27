import { NextResponse } from "next/server"
import {
  getRetryEntryAgentId,
  listWebhookRetryEntries,
} from "@/lib/webhooks/retry-store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const failures = listWebhookRetryEntries().filter((entry) => (
    entry.status === "dead" && getRetryEntryAgentId(entry) === agentId
  ))

  return NextResponse.json(failures, { headers: { "Cache-Control": "no-store" } })
}
