import { NextResponse } from "next/server"
import { isAddress } from "@solana/kit"
import { createWalletRpc } from "@/lib/agent-wallet/chain"
import { readAgentWallet } from "@/lib/agent-wallet/cookie"
import { getFeePayerSigner } from "@/lib/agent-wallet/fee-payer"
import { FUND_AMOUNT_MICRO, MAX_FUND_AMOUNT_MICRO, buildSponsoredFundTransaction } from "@/lib/agent-wallet/fund-tx"
import { fundLimits, takeLimits } from "@/lib/agent-wallet/limits"
import { getClientIp } from "@/lib/auth/middleware"
import { isStrictSameOrigin } from "@/lib/connections/hydrate"
import { microToUsdc, usdcToMicro } from "@/lib/orchestration/budget"
import { getKvStore } from "@/lib/security/kv-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

// Prepares the sponsored funding transaction: the server keypair pays the fee and the one-time
// rent of the agents' USDC account and signs as fee payer; the person's wallet signs the USDC
// transfer next (in the browser, after checking it) and sends it. The person needs no SOL.
// A 503 tells the browser to fall back to an unsponsored transaction its wallet pays for.
export async function POST(req: Request) {
  if (!isStrictSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  const opened = readAgentWallet(req)
  if (!opened) return json({ ok: false, error: "This browser has no agents' wallet yet. Reload the page." }, 404)

  const body = await req.json().catch(() => null) as { payer?: unknown; amountUsdc?: unknown } | null
  const payer = typeof body?.payer === "string" ? body.payer.trim() : ""
  if (!payer || !isAddress(payer) || payer === opened.record.address) return json({ ok: false, error: "Connect the wallet you want to fund from." }, 400)
  // Default 0.10 USDC (the Fund button); any amount from 0.01 to 10 USDC on request.
  const requested = body?.amountUsdc === undefined ? Number(FUND_AMOUNT_MICRO) : typeof body.amountUsdc === "string" || typeof body.amountUsdc === "number" ? usdcToMicro(body.amountUsdc) : null
  if (requested === null || requested < 10_000 || BigInt(requested) > MAX_FUND_AMOUNT_MICRO) return json({ ok: false, error: "Fund between 0.01 and 10 USDC." }, 400)

  const feePayer = await getFeePayerSigner()
  if (!feePayer) return json({ ok: false, error: "Sponsored funding is not configured on this server." }, 503)

  try {
    const limit = await takeLimits(getKvStore(), fundLimits(opened.record.uid, getClientIp(req)))
    if (!limit.ok) return json({ ok: false, error: "Too many funding requests. Try again later." }, 429)
  } catch {
    return json({ ok: false, error: "Funding is unavailable right now. Try again later." }, 503)
  }

  try {
    const { value } = await createWalletRpc().getLatestBlockhash({ commitment: "confirmed" }).send()
    const transaction = await buildSponsoredFundTransaction({ payer, agentWallet: opened.record.address, feePayer, latestBlockhash: value, amountMicro: BigInt(requested) })
    return json({ ok: true, transaction, feePayer: feePayer.address, amountUsdc: microToUsdc(requested) })
  } catch (error) {
    console.error("[agent-wallet] fund transaction failed:", error instanceof Error ? error.message : error)
    return json({ ok: false, error: "Could not prepare the funding transaction. Try again." }, 502)
  }
}
