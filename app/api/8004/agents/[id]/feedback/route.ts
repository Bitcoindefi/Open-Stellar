import { NextResponse } from "next/server"
import { isSameOrigin } from "@/lib/connections/hydrate"
import { IdentityError, prepareFeedback } from "@/lib/solana/agent-identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

// Returns a review transaction (already signed by the treasury as fee payer) for the payer's
// wallet to sign and send. Requires proof of an x402 payment to this agent.
export async function POST(req: Request, context: RouteContext) {
  if (!isSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  const { id } = await context.params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const paymentSignature = typeof body.paymentSignature === "string" ? body.paymentSignature.trim() : ""
  const payer = typeof body.payer === "string" ? body.payer.trim() : ""
  const score = typeof body.score === "number" ? body.score : Number.NaN
  if (!paymentSignature || !payer) return json({ ok: false, error: "A paid task is required to leave a review." }, 400)
  try {
    return json({ ok: true, ...(await prepareFeedback({ agentId: decodeURIComponent(id), score, paymentSignature, payer })) })
  } catch (error) {
    const status = error instanceof IdentityError ? error.status : 502
    return json({ ok: false, error: error instanceof Error ? error.message : "Could not prepare the review." }, status)
  }
}
