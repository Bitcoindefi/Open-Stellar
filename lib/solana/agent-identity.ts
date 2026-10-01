import { createHash } from "node:crypto"
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js"
import { SolanaSDK, Tag } from "8004-solana"
import { isOwnerTag, scopedAgentKey } from "@/lib/solana/agent-owner"
import { claimPaymentReview, getPaymentAgent, releasePaymentReview } from "@/lib/solana/payment-bindings"
import { AGENT_TASK_PRICE_BASE_UNITS, DEVNET_REGISTRY_PROGRAM, USDC_DEVNET_MINT } from "@/lib/solana/payment-constants"
import { explorerTxUrl, getPayTo } from "@/lib/solana/x402"

// Agent identity and reputation in the 8004 Agent Registry on Solana devnet.
// The server keypair (treasury) owns every agent and pays registration. Each agent gets a
// deterministic asset address derived from the server key, the owner tag and the agent id, so
// the app can find its identity again without a database. Reviews are signed by the user who paid.

export const REGISTRY_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
export { DEVNET_REGISTRY_PROGRAM }
/** A review must use a payment confirmed within this window. */
export const REVIEW_PAYMENT_MAX_AGE_SECONDS = 60 * 60

export type AgentProfile = { id: string; name: string; role: string; model: string; ownerTag?: string | null }
/** An agent id, optionally namespaced by its owner (see lib/solana/agent-owner.ts). */
export type AgentRef = string | { id: string; ownerTag?: string | null }

function refParts(ref: AgentRef): { id: string; ownerTag: string | null } {
  if (typeof ref === "string") return { id: ref, ownerTag: null }
  return { id: ref.id, ownerTag: isOwnerTag(ref.ownerTag) ? ref.ownerTag : null }
}
export type IdentityStatus = {
  agentId: string
  asset: string
  registered: boolean
  explorerUrl: string
  reputation: { averageScore: number; totalFeedbacks: number } | null
}

export function getRpcUrl(): string {
  return process.env.SOLANA_RPC?.trim() || "https://api.devnet.solana.com"
}

export function getServerKeypair(): Keypair | null {
  const raw = process.env.SOLANA_SERVER_SECRET?.trim()
  if (!raw) return null
  try {
    const bytes = JSON.parse(raw) as number[]
    return Array.isArray(bytes) && bytes.length === 64 ? Keypair.fromSecretKey(Uint8Array.from(bytes)) : null
  } catch {
    return null
  }
}

export function normalizeAgentId(value: string): string {
  return value.trim().slice(0, 80)
}

/**
 * v2 (owner tag present): one asset per owner and agent id, so two users with a "worker-1"
 * never share an identity. v1 (no owner): the original derivation, kept so identities
 * registered before owners existed stay readable.
 */
export function agentAssetKeypair(server: Keypair, agentId: string, ownerTag?: string | null): Keypair {
  const label = isOwnerTag(ownerTag)
    ? `agentic-city:8004-asset:v2:${ownerTag}:${normalizeAgentId(agentId)}`
    : `agentic-city:8004-asset:v1:${normalizeAgentId(agentId)}`
  const seed = createHash("sha256").update(server.secretKey).update(label).digest()
  return Keypair.fromSeed(seed)
}

export function addressExplorerUrl(address: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`
}

export function registrationUri(origin: string, agent: AgentProfile): string {
  const url = new URL(`/api/8004/agents/${encodeURIComponent(normalizeAgentId(agent.id))}/registration.json`, origin)
  url.searchParams.set("n", agent.name.slice(0, 40))
  url.searchParams.set("m", agent.model.slice(0, 60))
  if (isOwnerTag(agent.ownerTag)) url.searchParams.set("o", agent.ownerTag)
  const value = url.toString()
  return value.length <= 250 ? value : value.slice(0, 250)
}

export function buildRegistrationFile(origin: string, agentId: string, params: URLSearchParams, asset: string | null) {
  const name = (params.get("n") || agentId).slice(0, 40)
  const model = (params.get("m") || "").slice(0, 60)
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description: `${name} is an AI agent in Agentic City${model ? ` running ${model}` : ""}. It is paid per task with x402 on Solana.`,
    image: new URL("/icon.svg", origin).toString(),
    services: [{ name: "x402", endpoint: new URL(`/api/x402/agents/${encodeURIComponent(agentId)}/task`, origin).toString() }],
    x402Support: true,
    active: true,
    registrations: asset ? [{ agentId: asset, agentRegistry: `${REGISTRY_NETWORK}:${DEVNET_REGISTRY_PROGRAM}` }] : [],
  }
}

export type IdentityDeps = {
  createSdk: (signer?: Keypair) => Pick<SolanaSDK, "loadAgent" | "registerAgent" | "readAllFeedback" | "giveFeedback">
  connection: () => Pick<Connection, "sendRawTransaction" | "confirmTransaction" | "getTransaction">
  /** Clock seam for the payment age check. */
  now?: () => number
}

const defaultDeps: IdentityDeps = {
  createSdk: (signer) => new SolanaSDK({ cluster: "devnet", rpcUrl: getRpcUrl(), ...(signer ? { signer } : {}) }),
  connection: () => new Connection(getRpcUrl(), "confirmed"),
}

export class IdentityError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function requireServer(): Keypair {
  const server = getServerKeypair()
  if (!server) throw new IdentityError("Agent identity is not configured on this server.", 503)
  return server
}

export async function getIdentityStatus(agent: AgentRef, deps: IdentityDeps = defaultDeps): Promise<IdentityStatus> {
  const server = requireServer()
  const { id: agentId, ownerTag } = refParts(agent)
  const asset = agentAssetKeypair(server, agentId, ownerTag).publicKey
  const sdk = deps.createSdk()
  const account = await sdk.loadAgent(asset)
  let reputation: IdentityStatus["reputation"] = null
  if (account) {
    try {
      // Average the 0-100 scores ourselves: the SDK summary (0.8.5) reports 0 for agents
      // registered without the ATOM engine.
      const reviews = (await sdk.readAllFeedback(asset)).filter((review) => !review.revoked && typeof review.score === "number")
      const total = reviews.reduce((sum, review) => sum + (review.score ?? 0), 0)
      reputation = { averageScore: reviews.length ? Math.round(total / reviews.length) : 0, totalFeedbacks: reviews.length }
    } catch {
      reputation = null // indexer not caught up or unavailable
    }
  }
  return { agentId: normalizeAgentId(agentId), asset: asset.toBase58(), registered: Boolean(account), explorerUrl: addressExplorerUrl(asset.toBase58()), reputation }
}

export async function registerAgentIdentity(agent: AgentProfile, origin: string, deps: IdentityDeps = defaultDeps) {
  const server = requireServer()
  const assetKeypair = agentAssetKeypair(server, agent.id, agent.ownerTag)
  const sdk = deps.createSdk(server)
  if (await sdk.loadAgent(assetKeypair.publicKey)) {
    return { asset: assetKeypair.publicKey.toBase58(), signature: null, alreadyRegistered: true }
  }
  const prepared = await sdk.registerAgent(registrationUri(origin, agent), { skipSend: true, assetPubkey: assetKeypair.publicKey, signer: server.publicKey })
  if (!("transaction" in prepared) || typeof prepared.transaction !== "string") throw new IdentityError("The registry did not return a transaction.", 502)
  const tx = Transaction.from(Buffer.from(prepared.transaction, "base64"))
  tx.partialSign(server, assetKeypair)
  const connection = deps.connection()
  const signature = await connection.sendRawTransaction(tx.serialize())
  await connection.confirmTransaction({ signature, blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, "confirmed")
  return { asset: assetKeypair.publicKey.toBase58(), signature, alreadyRegistered: false }
}

const ZERO = BigInt(0)

type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount?: { amount?: string } }
type PaymentTransaction = NonNullable<Awaited<ReturnType<Connection["getTransaction"]>>>

/** Net change of `mint` held by `owner` across the transaction, in base units. */
export function tokenBalanceChange(meta: { preTokenBalances?: TokenBalance[] | null; postTokenBalances?: TokenBalance[] | null }, owner: string, mint: string): bigint {
  const amounts = new Map<number, { pre: bigint; post: bigint }>()
  const add = (list: TokenBalance[] | null | undefined, field: "pre" | "post") => {
    for (const balance of list ?? []) {
      if (balance.owner !== owner || balance.mint !== mint) continue
      const entry = amounts.get(balance.accountIndex) ?? { pre: ZERO, post: ZERO }
      try {
        entry[field] = BigInt(balance.uiTokenAmount?.amount ?? "0")
      } catch {
        entry[field] = ZERO
      }
      amounts.set(balance.accountIndex, entry)
    }
  }
  add(meta.preTokenBalances, "pre")
  add(meta.postTokenBalances, "post")
  let change = ZERO
  for (const { pre, post } of amounts.values()) change += post - pre
  return change
}

/**
 * Checks that `paid` is a successful, recent USDC payment of at least `minAmount` from
 * `payer` to `treasury`. Returns the reason it is not, or null when it is.
 */
export function checkPaymentTransaction(
  paid: PaymentTransaction | null,
  expected: { payer: string; treasury: string; minAmount: bigint; nowMs: number; mint?: string },
): string | null {
  if (!paid || !paid.meta) return "payment not found"
  if (paid.meta.err) return "payment failed on-chain"
  const mint = expected.mint ?? USDC_DEVNET_MINT
  const meta = paid.meta as unknown as { preTokenBalances?: TokenBalance[] | null; postTokenBalances?: TokenBalance[] | null }

  const message = paid.transaction.message
  const signers = (message.staticAccountKeys ?? []).slice(0, message.header?.numRequiredSignatures ?? 0).map((key) => key.toBase58())
  const payerChange = tokenBalanceChange(meta, expected.payer, mint)
  // The payer must have authorised the payment: either it signed the transaction, or it owns
  // the token account the money left from.
  if (!signers.includes(expected.payer) && payerChange >= ZERO) return "payer did not sign the payment"
  if (payerChange > -expected.minAmount) return "payer did not pay the task price"
  if (tokenBalanceChange(meta, expected.treasury, mint) < expected.minAmount) return "treasury did not receive the task price"

  const nowSeconds = Math.floor(expected.nowMs / 1000)
  if (!paid.blockTime || nowSeconds - paid.blockTime > REVIEW_PAYMENT_MAX_AGE_SECONDS || paid.blockTime - nowSeconds > 5 * 60) return "payment is too old"
  return null
}

/**
 * Builds a review transaction for the payer to sign. The review is only allowed for a recent
 * x402 payment from that wallet to the treasury, made through this app for this very agent,
 * and only once per payment. The treasury pays the network fee.
 */
export async function prepareFeedback(
  input: { agentId: string; ownerTag?: string | null; score: number; paymentSignature: string; payer: string },
  deps: IdentityDeps = defaultDeps,
) {
  const server = requireServer()
  const treasury = getPayTo()
  if (!treasury) throw new IdentityError("Payments are not configured on this server.", 503)
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 100) throw new IdentityError("Score must be an integer from 0 to 100.", 400)
  let payer: PublicKey
  try {
    payer = new PublicKey(input.payer)
  } catch {
    throw new IdentityError("Invalid payer address.", 400)
  }
  if (payer.equals(server.publicKey) || payer.toBase58() === treasury) throw new IdentityError("The agent owner cannot review its own agent.", 400)
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(input.paymentSignature)) throw new IdentityError("Invalid payment signature.", 400)

  // The payment must have been settled by this app's task route for this agent of this owner.
  const ownerTag = isOwnerTag(input.ownerTag) ? input.ownerTag : null
  if ((await getPaymentAgent(input.paymentSignature)) !== scopedAgentKey(input.agentId, ownerTag)) {
    throw new IdentityError("No x402 payment from this wallet to the agent was found.", 403)
  }

  const connection = deps.connection()
  const paid = await connection.getTransaction(input.paymentSignature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
  const problem = checkPaymentTransaction(paid, { payer: payer.toBase58(), treasury, minAmount: AGENT_TASK_PRICE_BASE_UNITS, nowMs: deps.now?.() ?? Date.now() })
  if (problem) throw new IdentityError(`No valid x402 payment from this wallet to the agent was found (${problem}).`, 403)

  const asset = agentAssetKeypair(server, input.agentId, ownerTag).publicKey
  const sdk = deps.createSdk()
  if (!(await sdk.loadAgent(asset))) throw new IdentityError("Register this agent's identity first.", 409)

  if (!(await claimPaymentReview(input.paymentSignature))) throw new IdentityError("This payment was already reviewed.", 409)
  try {
    const prepared = await sdk.giveFeedback(asset, {
      value: input.score,
      valueDecimals: 0,
      score: input.score,
      tag1: Tag.x402ResourceDelivered,
      tag2: Tag.x402Svm,
      endpoint: `/api/x402/agents/${encodeURIComponent(normalizeAgentId(input.agentId))}/task`.slice(0, 250),
      feedbackUri: explorerTxUrl(input.paymentSignature).slice(0, 250),
    }, { skipSend: true, signer: payer, feePayer: server.publicKey })
    if (!("transaction" in prepared) || typeof prepared.transaction !== "string") throw new IdentityError("The registry did not return a transaction.", 502)
    const tx = Transaction.from(Buffer.from(prepared.transaction, "base64"))
    // 8004-solana 0.8.5 ignores `feePayer` for reviews and leaves the reviewer as fee payer.
    // Set the treasury explicitly before signing so the reviewer needs no SOL.
    tx.feePayer = server.publicKey
    tx.partialSign(server)
    return { transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), asset: asset.toBase58() }
  } catch (error) {
    await releasePaymentReview(input.paymentSignature)
    throw error
  }
}
