import { NextResponse } from "next/server"

import { isAuthorized } from "@/lib/auth"
import {
  deliverSettlementWebhook,
  type SettlementWebhookPayload,
} from "@/lib/protocols/x402-settlement-webhook"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const settledAt = new Date().toISOString()
  const receiptId = `test_${Date.now().toString(36)}`
  const payload: SettlementWebhookPayload = {
    receiptId,
    agentId: "test-agent",
    amount: "1",
    asset: "XLM",
    settledAt,
    explorerUrl: `${new URL(req.url).origin}/explorer?q=${encodeURIComponent(receiptId)}`,
  }
  const delivery = await deliverSettlementWebhook(payload)

  return NextResponse.json({
    ok: delivery.status !== "failed",
    payload,
    delivery,
  })
}
