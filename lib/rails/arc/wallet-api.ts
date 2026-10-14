import { NextResponse } from "next/server"
import { balanceLimits, takeLimits, withdrawLimits } from "@/lib/agent-wallet/limits"
import { appendCookies } from "@/lib/connections/sealed-cookie"
import { microToUsdc, readCaps, spentToday, usdcToMicro } from "@/lib/orchestration/budget"
import { arcAccountFor, readArcAgentWallet, resolveArcAgentWallet } from "@/lib/rails/arc/agent-wallet"
import { createArcChain, withdrawArcUsdc, type ArcChain } from "@/lib/rails/arc/chain"
import {
  ARC_FAUCET_URL,
  ARC_FUND_AMOUNT_MICRO,
  ARC_MAX_FUND_AMOUNT_MICRO,
  ARC_TESTNET_CAIP2,
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
  ARC_WITHDRAW_GAS_RESERVE_MICRO,
  arcExplorerAddressUrl,
  arcExplorerTxUrl,
} from "@/lib/rails/arc/constants"
import { getKvStore } from "@/lib/security/kv-store"
import { AGENT_TASK_PRICE } from "@/lib/solana/payment-constants"

// The Arc side of /api/agent-wallet (GET ?network=arc) and /api/agent-wallet/withdraw
// (POST ?network=arc). The routes check same-origin first and then hand over here.
// There is no sponsored funding transaction on Arc: the person's own EVM wallet sends a plain
// USDC.transfer to the agents' wallet and pays about 0.001 USDC of gas, in USDC.

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

let chainFactory: () => ArcChain = () => createArcChain()
/** Test seam: fake the chain. */
export function setArcChainForTests(factory: (() => ArcChain) | null) {
  chainFactory = factory ?? (() => createArcChain())
}

export async function arcWalletStatus(req: Request): Promise<Response> {
  const browser = resolveArcAgentWallet(req, { create: true, refresh: true })
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
      balance = await chainFactory().usdcBalance(browser.wallet.address)
    } catch (error) {
      console.error("[agent-wallet:arc] balance unavailable:", error instanceof Error ? error.message : error)
    }
  }
  const spent = await spentToday(store, browser.uid).catch(() => 0)
  const caps = readCaps()
  const response = json({
    ok: true,
    network: ARC_TESTNET_CAIP2,
    chainId: ARC_TESTNET_CHAIN_ID,
    address: browser.wallet.address,
    created: browser.created,
    asset: ARC_USDC_ADDRESS,
    balanceMicro: balance === null ? null : balance.toString(),
    balanceUsdc: balance === null ? null : microToUsdc(Number(balance)),
    rateLimited: limited,
    fundUsdc: microToUsdc(Number(ARC_FUND_AMOUNT_MICRO)),
    maxFundUsdc: microToUsdc(Number(ARC_MAX_FUND_AMOUNT_MICRO)),
    hirePriceUsdc: microToUsdc(usdcToMicro(AGENT_TASK_PRICE) ?? 10_000),
    caps: { perRunUsdc: microToUsdc(caps.perRunMicro), perDayUsdc: microToUsdc(caps.perDayMicro) },
    spentTodayUsdc: microToUsdc(spent),
    gasReserveUsdc: microToUsdc(Number(ARC_WITHDRAW_GAS_RESERVE_MICRO)),
    withdrawAvailable: true,
    faucetUrl: ARC_FAUCET_URL,
    explorerUrl: arcExplorerAddressUrl(browser.wallet.address),
  })
  appendCookies(req, response.headers, browser.cookies)
  return response
}

export async function arcWithdraw(req: Request): Promise<Response> {
  const opened = readArcAgentWallet(req)
  if (!opened) return json({ ok: false, error: "This browser has no Arc agents' wallet." }, 404)
  const body = await req.json().catch(() => null) as { to?: unknown } | null
  const destination = typeof body?.to === "string" ? body.to.trim() : ""
  try {
    const limit = await takeLimits(getKvStore(), withdrawLimits(opened.record.uid))
    if (!limit.ok) return json({ ok: false, error: "Too many withdrawals. Try again later." }, 429)
  } catch {
    return json({ ok: false, error: "Withdrawals are unavailable right now. Try again later." }, 503)
  }
  try {
    const result = await withdrawArcUsdc({ chain: chainFactory(), agent: arcAccountFor(opened.record), destination })
    if (!result.ok) return json({ ok: false, error: result.error }, result.status)
    return json({ ok: true, signature: result.hash, confirmed: result.confirmed, amountUsdc: microToUsdc(Number(result.amountMicro)), explorerUrl: arcExplorerTxUrl(result.hash) })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    console.error("[agent-wallet:arc] withdraw failed:", message)
    if (/insufficient funds|exceeds the balance|gas/i.test(message)) return json({ ok: false, error: "The agents' wallet cannot cover the withdrawal gas (paid in USDC). Fund it a little and try again." }, 409)
    return json({ ok: false, error: "The withdrawal did not go through. Try again." }, 502)
  }
}
