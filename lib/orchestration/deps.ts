import type { KeyPairSigner } from "@solana/kit"
import { createWalletRpc, getUsdcBalance, serverRpcUrl, type WalletRpc } from "@/lib/agent-wallet/chain"
import { signerFor, type AgentWalletRecord } from "@/lib/agent-wallet/cookie"
import { createChatModel } from "@/lib/ai/stream"
import { approvalKeyFromEnv, createApprovalSigner } from "@/lib/orchestration/approval"
import { readCaps, usdcToMicro } from "@/lib/orchestration/budget"
import type { ChatRunDeps } from "@/lib/orchestration/chat-run"
import { DEFAULT_HANDOFF_CAPS, type HandoffDeps } from "@/lib/orchestration/handoff"
import { createOrchestratorFetch, payAgentTask, type PaidFetch } from "@/lib/orchestration/wallet"
import { getKvStore } from "@/lib/security/kv-store"
import { AGENT_TASK_PRICE } from "@/lib/solana/x402"

/**
 * Where hired agents' x402 endpoints live. ORCHESTRATOR_X402_BASE_URL when set (for example the
 * production URL while developing locally); otherwise this deployment's own origin.
 */
export function hireBaseUrl(requestUrl: string, env: Record<string, string | undefined> = process.env): string {
  const configured = env.ORCHESTRATOR_X402_BASE_URL?.trim()
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/+$/, "")
  return new URL(requestUrl).origin
}

/**
 * The hire function for one browser: checks the agents' wallet balance first (an empty wallet
 * gets the Fund button, not a failed payment), then pays the task over x402 from that wallet.
 * A balance that cannot be read does not block the hire: the payment itself is the real check.
 */
export function createWalletHire(input: { signer: KeyPairSigner; rpc: WalletRpc; paidFetch: PaidFetch; baseUrl: string; priceMicro: number }): NonNullable<HandoffDeps["hire"]> {
  return async (agent, task) => {
    let balance: bigint | null = null
    try {
      balance = await getUsdcBalance(input.rpc, input.signer.address)
    } catch {
      balance = null
    }
    if (balance !== null && balance < BigInt(input.priceMicro)) {
      return { ok: false, code: "unfunded", balanceMicro: Number(balance), error: "the agents' wallet does not hold enough USDC" }
    }
    return payAgentTask({ baseUrl: input.baseUrl, agent, task }, input.paidFetch)
  }
}

export async function createChatRunDeps(
  requestUrl: string,
  browser: { uid: string; wallet: AgentWalletRecord | null },
  env: Record<string, string | undefined> = process.env,
  rpc: WalletRpc = createWalletRpc(serverRpcUrl(env)),
): Promise<ChatRunDeps> {
  const priceMicro = usdcToMicro(AGENT_TASK_PRICE) ?? 10_000
  const key = approvalKeyFromEnv(env)
  const baseUrl = hireBaseUrl(requestUrl, env)
  let hire: ChatRunDeps["hire"] = null
  if (browser.wallet) {
    const signer = await signerFor(browser.wallet)
    const paidFetch = createOrchestratorFetch(signer, { maxAtomic: BigInt(priceMicro), rpcUrl: serverRpcUrl(env) })
    hire = createWalletHire({ signer, rpc, paidFetch, baseUrl, priceMicro })
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
  }
}
