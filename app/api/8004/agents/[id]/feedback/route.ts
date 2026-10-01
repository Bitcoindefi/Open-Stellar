import { NextResponse } from "next/server"
import { isStrictSameOrigin } from "@/lib/connections/hydrate"
import { IdentityError, prepareFeedback } from "@/lib/solana/agent-identity"
import { resolveAgentOwner } from "@/lib/solana/agent-owner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

// Returns a review transaction (already signed by the treasury as fee payer) for the payer's
// wallet to sign and send. Requires proof of an x402 payment to this agent, one review each.
export async function POST(req: Request, context: RouteContext) {
  if (!isStrictSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  const { id } = await context.params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const paymentSignature = typeof body.paymentSignature === "string" ? body.paymentSignature.trim() : ""
  const payer = typeof body.payer === "string" ? body.payer.trim() : ""
  const score = typeof body.score === "number" ? body.score : Number.NaN
  if (!paymentSignature || !payer) return json({ ok: false, error: "A paid task is required to leave a review." }, 400)
  try {
    const owner = await resolveAgentOwner(req)
    return json({ ok: true, ...(await prepareFeedback({ agentId: decodeURIComponent(id), ownerTag: owner?.tag ?? null, score, paymentSignature, payer })) })
  } catch (error) {
    if (error instanceof IdentityError) return json({ ok: false, error: error.message }, error.status)
    console.error("[8004] could not prepare review:", error instanceof Error ? error.message : error)
    return json({ ok: false, error: "Could not prepare the review." }, 502)
  }
}
