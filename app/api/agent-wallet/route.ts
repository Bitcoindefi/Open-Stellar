import { NextResponse } from "next/server"
import { createWalletRpc, getUsdcBalance } from "@/lib/agent-wallet/chain"
import { resolveAgentWallet } from "@/lib/agent-wallet/cookie"
import { getFeePayerSigner } from "@/lib/agent-wallet/fee-payer"
import { FUND_AMOUNT_MICRO } from "@/lib/agent-wallet/fund-tx"
import { balanceLimits, takeLimits } from "@/lib/agent-wallet/limits"
import { isSameOrigin } from "@/lib/connections/hydrate"
import { appendCookies } from "@/lib/connections/sealed-cookie"
import { microToUsdc, readCaps, spentToday, usdcToMicro } from "@/lib/orchestration/budget"
import { getKvStore } from "@/lib/security/kv-store"
import { AGENT_TASK_PRICE, SOLANA_DEVNET_NETWORK, USDC_DEVNET_MINT } from "@/lib/solana/payment-constants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

// This browser's agents' wallet: created on first visit (the secret goes only into a sealed
// httpOnly cookie), then its public address, USDC balance and today's spend. Never the secret.
export async function GET(req: Request) {
  if (!isSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  const browser = await resolveAgentWallet(req, { create: true, refresh: true })
  if (!browser?.wallet) return json({ ok: false, error: "Agents' wallets are not configured on this server." }, 503)
  const store = getKvStore()

  let limited = false
  try {
    limited = !(await takeLimits(store, balanceLimits(browser.uid))).ok
  } catch {
    limited = false
  }
  let balance: bigint | null = null
  if (!limited) {
    try {
      balance = await getUsdcBalance(createWalletRpc(), browser.wallet.address)
    } catch (error) {
      console.error("[agent-wallet] balance unavailable:", error instanceof Error ? error.message : error)
    }
  }
  const spent = await spentToday(store, browser.uid).catch(() => 0)
  const caps = readCaps()
  const feePayer = await getFeePayerSigner()

  const response = json({
    ok: true,
    address: browser.wallet.address,
    created: browser.created,
    network: SOLANA_DEVNET_NETWORK,
    mint: USDC_DEVNET_MINT,
    balanceMicro: balance === null ? null : balance.toString(),
    balanceUsdc: balance === null ? null : microToUsdc(Number(balance)),
    rateLimited: limited,
    fundUsdc: microToUsdc(Number(FUND_AMOUNT_MICRO)),
    hirePriceUsdc: microToUsdc(usdcToMicro(AGENT_TASK_PRICE) ?? 10_000),
    caps: { perRunUsdc: microToUsdc(caps.perRunMicro), perDayUsdc: microToUsdc(caps.perDayMicro) },
    spentTodayUsdc: microToUsdc(spent),
    // The server key that sponsors funding and withdrawals; the browser checks the fee payer
    // of the funding transaction against it before the wallet signs.
    feePayer: feePayer?.address ?? null,
    withdrawAvailable: Boolean(feePayer),
    explorerUrl: `https://explorer.solana.com/address/${browser.wallet.address}?cluster=devnet`,
  })
  appendCookies(req, response.headers, browser.cookies)
  return response
}
