import { createChatModel } from "@/lib/ai/stream"
import { approvalKeyFromEnv, createApprovalSigner } from "@/lib/orchestration/approval"
import { readCaps, usdcToMicro } from "@/lib/orchestration/budget"
import type { ChatRunDeps } from "@/lib/orchestration/chat-run"
import { DEFAULT_HANDOFF_CAPS } from "@/lib/orchestration/handoff"
import { createOrchestratorFetch, getOrchestratorSigner, payAgentTask } from "@/lib/orchestration/wallet"
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

export async function createChatRunDeps(requestUrl: string, env: Record<string, string | undefined> = process.env): Promise<ChatRunDeps> {
  const priceMicro = usdcToMicro(AGENT_TASK_PRICE) ?? 10_000
  const signer = await getOrchestratorSigner(env)
  const key = approvalKeyFromEnv(env)
  const baseUrl = hireBaseUrl(requestUrl, env)
  const paidFetch = signer
    ? createOrchestratorFetch(signer, { maxAtomic: BigInt(priceMicro), rpcUrl: env.SOLANA_DEVNET_RPC_URL?.trim() || undefined })
    : null

  return {
    modelFor: (connection) => createChatModel(connection),
    hire: paidFetch ? (agent, task) => payAgentTask({ baseUrl, agent, task }, paidFetch) : null,
    store: getKvStore(),
    budget: readCaps(env),
    caps: DEFAULT_HANDOFF_CAPS,
    priceMicro,
    approvals: key ? createApprovalSigner(key) : null,
  }
}
