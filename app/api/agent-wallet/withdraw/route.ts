import { NextResponse } from "next/server"
import { isAddress } from "@solana/kit"
import { createWalletRpc, withdrawAll } from "@/lib/agent-wallet/chain"
import { readAgentWallet, signerFor } from "@/lib/agent-wallet/cookie"
import { getFeePayerSigner } from "@/lib/agent-wallet/fee-payer"
import { takeLimits, withdrawLimits } from "@/lib/agent-wallet/limits"
import { isStrictSameOrigin } from "@/lib/connections/hydrate"
import { microToUsdc } from "@/lib/orchestration/budget"
import { getKvStore } from "@/lib/security/kv-store"
import { explorerTxUrl } from "@/lib/solana/x402"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

// Withdraw all: every USDC in this browser's agents' wallet goes back to the wallet the person
// names (normally the one they funded from), and the token account is closed. The cookie key
// signs the transfer; the server keypair only pays the network fee.
export async function POST(req: Request) {
  if (!isStrictSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  const opened = readAgentWallet(req)
  if (!opened) return json({ ok: false, error: "This browser has no agents' wallet." }, 404)

  const body = await req.json().catch(() => null) as { to?: unknown } | null
  const destination = typeof body?.to === "string" ? body.to.trim() : ""
  if (!destination || !isAddress(destination)) return json({ ok: false, error: "Connect the wallet that should receive the USDC." }, 400)

  const feePayer = await getFeePayerSigner()
  if (!feePayer) return json({ ok: false, error: "Withdrawals are not configured on this server." }, 503)

  try {
    const limit = await takeLimits(getKvStore(), withdrawLimits(opened.record.uid))
    if (!limit.ok) return json({ ok: false, error: "Too many withdrawals. Try again later." }, 429)
  } catch {
    return json({ ok: false, error: "Withdrawals are unavailable right now. Try again later." }, 503)
  }

  try {
    const agent = await signerFor(opened.record)
    const result = await withdrawAll({ rpc: createWalletRpc(), agent, feePayer, destination })
    if (!result.ok) return json({ ok: false, error: result.error }, result.status)
    return json({
      ok: true,
      signature: result.signature,
      confirmed: result.confirmed,
      amountUsdc: microToUsdc(Number(result.amountMicro)),
      explorerUrl: explorerTxUrl(result.signature),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    console.error("[agent-wallet] withdraw failed:", message)
    if (/insufficient|lamports|0x1\b/i.test(message)) return json({ ok: false, error: "The server has no devnet SOL to pay the withdrawal fee right now." }, 503)
    return json({ ok: false, error: "The withdrawal did not go through. Try again." }, 502)
  }
}
