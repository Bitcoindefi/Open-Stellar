import { createWalletRpc, serverRpcUrl } from "@/lib/agent-wallet/chain"
import { publicOrigin } from "@/lib/mcp/config"
import type { McpToolDeps } from "@/lib/mcp/server"
import { hostedConnection } from "@/lib/mcp/roster"
import { readCaps, usdcToMicro } from "@/lib/orchestration/budget"
import { hireBaseUrl } from "@/lib/orchestration/deps"
import { createOrchestratorFetch } from "@/lib/orchestration/wallet"
import { getKvStore } from "@/lib/security/kv-store"
import { getIdentityStatus } from "@/lib/solana/agent-identity"
import { browserOwner } from "@/lib/solana/agent-owner"
import { AGENT_TASK_PRICE } from "@/lib/solana/x402"

/** Production wiring of the MCP tools for one request and the browser id behind its grant. */
export function createMcpDeps(requestUrl: string, uid: string, env: Record<string, string | undefined> = process.env): McpToolDeps {
  const priceMicro = usdcToMicro(AGENT_TASK_PRICE) ?? 10_000
  const rpcUrl = serverRpcUrl(env)
  return {
    store: getKvStore(),
    origin: publicOrigin(requestUrl, env),
    baseUrl: hireBaseUrl(requestUrl, env),
    caps: readCaps(env),
    priceMicro,
    rpc: createWalletRpc(rpcUrl),
    paidFetchFor: (signer) => createOrchestratorFetch(signer, { maxAtomic: BigInt(priceMicro), rpcUrl }),
    hostedReady: Boolean(hostedConnection(env)),
    ownerTag: browserOwner(uid)?.tag ?? null,
    reputation: (agentId, ownerTag) => getIdentityStatus({ id: agentId, ownerTag }),
  }
}
