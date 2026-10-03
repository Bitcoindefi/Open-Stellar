import { createHash, randomBytes } from "node:crypto"
import { createAgentWallet, type AgentWalletRecord } from "@/lib/agent-wallet/cookie"
import { approveAuthorization, checkAuthorizeRequest, exchangeCode, registerClient, type McpClient } from "@/lib/mcp/oauth"
import type { McpAgent } from "@/lib/mcp/roster"
import type { KvStore } from "@/lib/security/kv-store"

export const ORIGIN = "https://agentic-city.test"
export const REDIRECT = "http://localhost:33418/callback"
export const UID = "a".repeat(32)

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export function authorizeParams(client: McpClient, challenge: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-1",
    ...extra,
  })
}

export async function newClient(store: KvStore, name = "Claude Code"): Promise<McpClient> {
  const result = await registerClient(store, { client_name: name, redirect_uris: [REDIRECT] })
  if (!result.ok) throw new Error(result.error_description)
  return result.client
}

/** Registers a client, approves it for a fresh wallet and exchanges the code for tokens. */
export async function connectGrant(store: KvStore, options: { uid?: string; capMicro?: number; team?: McpAgent[]; wallet?: AgentWalletRecord; scope?: string; now?: Date } = {}) {
  const client = await newClient(store)
  const { verifier, challenge } = pkcePair()
  const check = await checkAuthorizeRequest(store, authorizeParams(client, challenge, options.scope ? { scope: options.scope } : {}), ORIGIN)
  if (!check.ok) throw new Error(check.description)
  const wallet = options.wallet ?? await createAgentWallet(options.uid ?? UID)
  const { code, grant } = await approveAuthorization(store, {
    request: check.request,
    client,
    uid: options.uid ?? UID,
    wallet,
    capMicro: options.capMicro ?? 100_000,
    team: options.team ?? [],
  }, options.now)
  const tokens = await exchangeCode(store, { code, codeVerifier: verifier, redirectUri: REDIRECT, clientId: client.client_id }, ORIGIN, options.now)
  if (!tokens.ok) throw new Error(tokens.error_description)
  return { client, wallet, grant, tokens: tokens.body }
}
