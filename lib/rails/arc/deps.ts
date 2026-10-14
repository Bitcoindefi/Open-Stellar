import { createChatModel } from "@/lib/ai/stream"
import { approvalKeyFromEnv, createApprovalSigner } from "@/lib/orchestration/approval"
import { readCaps, usdcToMicro } from "@/lib/orchestration/budget"
import type { ChatRunDeps } from "@/lib/orchestration/chat-run"
import { createBalanceCheckedHire, hireBaseUrl } from "@/lib/orchestration/deps"
import { DEFAULT_HANDOFF_CAPS, type HandoffNetwork } from "@/lib/orchestration/handoff"
import type { HireRail, PaidFetch } from "@/lib/orchestration/wallet"
import { ARC_RAIL } from "@/lib/rails"
import { arcAccountFor, type ArcAgentWalletRecord } from "@/lib/rails/arc/agent-wallet"
import { createArcChain, type ArcChain } from "@/lib/rails/arc/chain"
import { arcRpcUrl } from "@/lib/rails/arc/constants"
import { createArcPaidFetch } from "@/lib/rails/arc/paid-fetch"
import { getArcPayTo } from "@/lib/rails/arc/x402"
import { getKvStore } from "@/lib/security/kv-store"
import { AGENT_TASK_PRICE } from "@/lib/solana/payment-constants"

// The chat run's dependencies when the person chose Arc in "Red de pago": same caps, approvals and
// ledger as Solana (per browser id), but hires are paid from the Arc agents' wallet over x402 on
// Arc testnet, and prompts and receipts say so.

export const ARC_HANDOFF_NETWORK: HandoffNetwork = { caip2: ARC_RAIL.caip2, receiptNetwork: ARC_RAIL.receiptNetwork, label: ARC_RAIL.label }
export const ARC_HIRE_RAIL: HireRail = { id: "arc", caip2: ARC_RAIL.caip2, asset: ARC_RAIL.asset, explorerTx: ARC_RAIL.explorerTx }

export function createArcChatRunDeps(
  requestUrl: string,
  browser: { uid: string; wallet: ArcAgentWalletRecord | null },
  env: Record<string, string | undefined> = process.env,
  options: { chain?: ArcChain; paidFetchFor?: (wallet: ArcAgentWalletRecord, maxAtomic: bigint) => PaidFetch } = {},
): ChatRunDeps {
  const priceMicro = usdcToMicro(AGENT_TASK_PRICE) ?? 10_000
  const key = approvalKeyFromEnv(env)
  const baseUrl = hireBaseUrl(requestUrl, env)
  let hire: ChatRunDeps["hire"] = null
  if (browser.wallet) {
    const wallet = browser.wallet
    const chain = options.chain ?? createArcChain(arcRpcUrl(env))
    const paidFetch = options.paidFetchFor
      ? options.paidFetchFor(wallet, BigInt(priceMicro))
      // Pays only this deployment's treasury when it is configured here; a remote base URL
      // (ORCHESTRATOR_X402_BASE_URL) is still bound by network, asset and amount.
      : createArcPaidFetch(arcAccountFor(wallet), { maxAtomic: BigInt(priceMicro), payTo: env.ORCHESTRATOR_X402_BASE_URL ? null : getArcPayTo(env) })
    hire = createBalanceCheckedHire({ readBalance: () => chain.usdcBalance(wallet.address), paidFetch, baseUrl, priceMicro, rail: ARC_HIRE_RAIL })
  }
  return {
    modelFor: (connection) => createChatModel(connection),
    hire,
    owner: browser.uid,
    wallet: browser.wallet ? { address: browser.wallet.address } : null,
    store: getKvStore(),
    budget: readCaps(env),
    caps: DEFAULT_HANDOFF_CAPS,
    priceMicro,
    approvals: key ? createApprovalSigner(key) : null,
    network: ARC_HANDOFF_NETWORK,
  }
}
