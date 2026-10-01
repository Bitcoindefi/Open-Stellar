import { createHash } from "node:crypto"
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js"
import { SolanaSDK, Tag } from "8004-solana"
import { explorerTxUrl, getPayTo } from "@/lib/solana/x402"

// Agent identity and reputation in the 8004 Agent Registry on Solana devnet.
// The server keypair (treasury) owns every agent and pays registration. Each agent gets a
// deterministic asset address derived from the server key and the agent id, so the app can
// find its identity again without a database. Reviews are signed by the user who paid.

export const REGISTRY_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
export const DEVNET_REGISTRY_PROGRAM = "8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C"
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

export type AgentProfile = { id: string; name: string; role: string; model: string }
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

export function agentAssetKeypair(server: Keypair, agentId: string): Keypair {
  const seed = createHash("sha256").update(server.secretKey).update(`agentic-city:8004-asset:v1:${normalizeAgentId(agentId)}`).digest()
  return Keypair.fromSeed(seed)
}

export function addressExplorerUrl(address: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`
}

export function registrationUri(origin: string, agent: AgentProfile): string {
  const url = new URL(`/api/8004/agents/${encodeURIComponent(normalizeAgentId(agent.id))}/registration.json`, origin)
  url.searchParams.set("n", agent.name.slice(0, 40))
  url.searchParams.set("m", agent.model.slice(0, 60))
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

export async function getIdentityStatus(agentId: string, deps: IdentityDeps = defaultDeps): Promise<IdentityStatus> {
  const server = requireServer()
  const asset = agentAssetKeypair(server, agentId).publicKey
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
  const assetKeypair = agentAssetKeypair(server, agent.id)
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

const reviewAttempts = new Map<string, number>()
const MAX_REVIEW_ATTEMPTS = 3

/** Test seam. */
export function resetReviewedPaymentsForTests() {
  reviewAttempts.clear()
}

type TokenBalance = { owner?: string; mint: string }

/**
 * Builds a review transaction for the payer to sign. The review is only allowed for a real
 * x402 payment from that wallet to the treasury; the treasury pays the network fee.
 */
export async function prepareFeedback(input: { agentId: string; score: number; paymentSignature: string; payer: string }, deps: IdentityDeps = defaultDeps) {
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
  if (payer.equals(server.publicKey)) throw new IdentityError("The agent owner cannot review its own agent.", 400)
  if ((reviewAttempts.get(input.paymentSignature) ?? 0) >= MAX_REVIEW_ATTEMPTS) throw new IdentityError("This payment was already reviewed.", 409)

  const connection = deps.connection()
  const paid = await connection.getTransaction(input.paymentSignature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
  const keys = paid?.transaction.message.staticAccountKeys?.map((key) => key.toBase58()) ?? []
  const balances = (paid?.meta?.postTokenBalances ?? []) as TokenBalance[]
  const toTreasury = balances.some((balance) => balance.owner === treasury && balance.mint === USDC_DEVNET)
  if (!paid || paid.meta?.err || !keys.includes(payer.toBase58()) || !toTreasury) {
    throw new IdentityError("No x402 payment from this wallet to the agent was found.", 403)
  }

  const asset = agentAssetKeypair(server, input.agentId).publicKey
  const sdk = deps.createSdk()
  if (!(await sdk.loadAgent(asset))) throw new IdentityError("Register this agent's identity first.", 409)
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
  reviewAttempts.set(input.paymentSignature, (reviewAttempts.get(input.paymentSignature) ?? 0) + 1)
  return { transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), asset: asset.toBase58() }
}
