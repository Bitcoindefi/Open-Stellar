import { createKeyPairSignerFromPrivateKeyBytes, type KeyPairSigner } from "@solana/kit"
import { getUsdcBalance, type WalletRpc } from "@/lib/agent-wallet/chain"
import { takeLimits } from "@/lib/agent-wallet/limits"
import { createApproval, releaseApproval, redeemApproval, type ApprovalReason } from "@/lib/mcp/approvals"
import { HIRES_PER_GRANT_PER_MINUTE, SCOPES } from "@/lib/mcp/config"
import { HOSTED_HEADER, signHostedTask } from "@/lib/mcp/crypto"
import { openGrantSeed, type AuthenticatedGrant } from "@/lib/mcp/oauth"
import { findAgent, rosterFor, type McpAgent } from "@/lib/mcp/roster"
import { microToUsdc, releaseDaily, reserveDaily, spentToday, type OrchestratorCaps, type Reservation } from "@/lib/orchestration/budget"
import { payAgentTask, type HopReceipt, type PaidFetch } from "@/lib/orchestration/wallet"
import type { KvStore } from "@/lib/security/kv-store"

// Hiring one agent from an MCP client. Same money path as the chat (an x402 payment on Solana
// devnet, signed with the browser's agents' wallet), with two ledgers checked first: the
// client's own daily cap (set on the consent page) and the browser's daily cap, which the chat
// shares. Over either cap nothing is paid: the person gets a link to approve that one hire.

export type McpHireDeps = {
  store: KvStore
  /** Public origin, for the links the person opens. */
  origin: string
  /** Where the x402 task endpoints live (see hireBaseUrl). */
  baseUrl: string
  caps: OrchestratorCaps
  priceMicro: number
  rpc: WalletRpc
  paidFetchFor: (signer: KeyPairSigner) => PaidFetch
  /** False when no hosted model is configured: hiring is then off. */
  hostedReady: boolean
  /** The 8004 owner tag of the browser that approved the client. */
  ownerTag: string | null
  now?: () => Date
}

export type HireOutcome =
  | { ok: true; agent: McpAgent; answer: string; receipt: HopReceipt }
  | { ok: false; message: string; approvalId?: string; approveUrl?: string; receipt?: HopReceipt }

/** The ledger owner of one MCP grant (kept apart from the browser's ledger). */
export function grantLedger(grantId: string): string {
  return `mcp:${grantId}`
}

export function approveUrl(origin: string, approvalId: string): string {
  return `${origin}/mcp/approve?id=${approvalId}`
}

export function walletPageUrl(origin: string): string {
  return `${origin}/mcp`
}

/** The signer of a grant's agents' wallet, checked against the address it was approved with. */
export async function grantSigner(auth: AuthenticatedGrant): Promise<KeyPairSigner | null> {
  const seed = openGrantSeed(auth)
  if (!seed) return null
  try {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(seed)
    return signer.address === auth.grant.address ? signer : null
  } finally {
    seed.fill(0)
  }
}

async function release(store: KvStore, reservations: Reservation[]): Promise<void> {
  for (const reservation of reservations) {
    if (reservation.ok) await releaseDaily(store, reservation).catch(() => undefined)
  }
}

async function overCap(deps: McpHireDeps, auth: AuthenticatedGrant, agent: McpAgent, task: string, reason: ApprovalReason): Promise<HireOutcome> {
  const { grant } = auth
  const cap = reason === "grant" ? grant.capMicro : deps.caps.perDayMicro
  const approval = await createApproval(deps.store, {
    grantId: grant.id,
    uid: grant.uid,
    clientName: grant.clientName,
    agentId: agent.id,
    agentName: agent.name,
    amountMicro: deps.priceMicro,
    reason,
    capMicro: cap,
    task,
  }, deps.now?.())
  const url = approveUrl(deps.origin, approval.id)
  const which = reason === "grant" ? `this MCP client's daily cap of ${microToUsdc(cap)} USDC` : `the agents' wallet daily cap of ${microToUsdc(cap)} USDC (shared with the chat)`
  return {
    ok: false,
    approvalId: approval.id,
    approveUrl: url,
    message: `Hiring ${agent.name} costs ${microToUsdc(deps.priceMicro)} USDC and would go over ${which}, so nothing was paid. ` +
      `Ask the person to approve this one hire in their browser: ${url} (valid 15 minutes). ` +
      `After they approve, call hire_agent again with the same agentId and task and approvalId "${approval.id}".`,
  }
}

export async function hireOverMcp(deps: McpHireDeps, auth: AuthenticatedGrant, input: { agentId: string; task: string; approvalId?: string }): Promise<HireOutcome> {
  const { grant } = auth
  if (!auth.scopes.includes(SCOPES.hire)) return { ok: false, message: "This connection was approved without permission to hire (scope agents:hire). Reconnect the client to ask for it." }
  const task = input.task.trim()
  if (!task || task.length > 2000) return { ok: false, message: "Describe the task in 1 to 2000 characters." }
  if (!deps.hostedReady) return { ok: false, message: "Hiring from MCP is not configured on this server (no hosted model). Nothing was paid." }

  const roster = rosterFor(grant.team)
  const agent = findAgent(roster, input.agentId)
  if (!agent) return { ok: false, message: `There is no agent "${input.agentId.slice(0, 60)}" on this team. Available: ${roster.map((item) => item.id).join(", ")}.` }

  const minute = Math.floor((deps.now?.() ?? new Date()).getTime() / 60_000)
  const reservations: Reservation[] = []
  let approvalId: string | null = null
  try {
    const limited = await takeLimits(deps.store, [{ key: `mcp:hire:${grant.id}:${minute}`, max: HIRES_PER_GRANT_PER_MINUTE, windowSeconds: 90 }])
    if (!limited.ok) return { ok: false, message: `Too many hires in a minute (the limit is ${HIRES_PER_GRANT_PER_MINUTE}). Wait a moment and try again; nothing was paid.` }

    if (input.approvalId) {
      const used = await redeemApproval(deps.store, input.approvalId, { grantId: grant.id, agentId: agent.id, task }, approveUrl(deps.origin, input.approvalId))
      if (!used.ok) return { ok: false, message: used.message }
      approvalId = used.approval.id
      // Approved: the soft caps are lifted for this hire, the browser's hard ceiling is not.
      const hard = await reserveDaily(deps.store, grant.uid, deps.priceMicro, deps.caps.hardDayMicro, deps.now?.())
      if (!hard.ok) {
        await releaseApproval(deps.store, approvalId)
        return { ok: false, message: `The agents' wallet reached its hard daily limit of ${microToUsdc(deps.caps.hardDayMicro)} USDC, so even approved hires wait until tomorrow (UTC). Nothing was paid.` }
      }
      reservations.push(hard)
      reservations.push(await reserveDaily(deps.store, grantLedger(grant.id), deps.priceMicro, Number.MAX_SAFE_INTEGER, deps.now?.()))
    } else {
      const own = await reserveDaily(deps.store, grantLedger(grant.id), deps.priceMicro, grant.capMicro, deps.now?.())
      if (!own.ok) return overCap(deps, auth, agent, task, "grant")
      reservations.push(own)
      const shared = await reserveDaily(deps.store, grant.uid, deps.priceMicro, deps.caps.perDayMicro, deps.now?.())
      if (!shared.ok) {
        await release(deps.store, reservations)
        return overCap(deps, auth, agent, task, "browser")
      }
      reservations.push(shared)
    }
  } catch {
    await release(deps.store, reservations)
    if (approvalId) await releaseApproval(deps.store, approvalId).catch(() => undefined)
    return { ok: false, message: "The spending ledger could not be checked just now, so nothing was paid. Try again in a moment." }
  }

  const undo = async () => {
    await release(deps.store, reservations)
    if (approvalId) await releaseApproval(deps.store, approvalId).catch(() => undefined)
  }

  const signer = await grantSigner(auth)
  if (!signer) {
    await undo()
    return { ok: false, message: "The agents' wallet of this connection could not be opened. Reconnect the client from the browser. Nothing was paid." }
  }

  let balance: bigint | null = null
  try {
    balance = await getUsdcBalance(deps.rpc, signer.address)
  } catch {
    balance = null // the payment itself is the real check
  }
  if (balance !== null && balance < BigInt(deps.priceMicro)) {
    await undo()
    return {
      ok: false,
      message: `The agents' wallet (${signer.address}) holds ${microToUsdc(Number(balance))} USDC and a hire costs ${microToUsdc(deps.priceMicro)} USDC, so nothing was paid. ` +
        `Ask the person to fund it with devnet USDC at ${walletPageUrl(deps.origin)}.`,
    }
  }

  let header: string
  try {
    header = signHostedTask({ agentId: agent.id, task, ownerTag: deps.ownerTag }, (deps.now?.() ?? new Date()).getTime())
  } catch {
    await undo()
    return { ok: false, message: "Hiring from MCP is not configured on this server. Nothing was paid." }
  }

  const result = await payAgentTask({ baseUrl: deps.baseUrl, agent, task, hosted: { header: HOSTED_HEADER, value: header } }, deps.paidFetchFor(signer))
  if (!result.receipt) {
    await undo()
    const reason = result.ok ? "no payment receipt came back" : result.error.replace(/\.+$/, "")
    return { ok: false, message: `Hiring ${agent.name} did not go through: ${reason}. Nothing was charged.` }
  }
  if (!result.ok) {
    return { ok: false, receipt: result.receipt, message: `Paid ${microToUsdc(deps.priceMicro)} USDC to hire ${agent.name} (tx ${result.receipt.transaction}) but it could not finish: ${result.error.replace(/\.+$/, "")}.` }
  }
  return { ok: true, agent, answer: result.answer, receipt: result.receipt }
}

export type WalletStatus = {
  address: string
  balanceUsdc: string | null
  priceUsdc: string
  spentToday: { thisClientUsdc: string; agentsWalletUsdc: string }
  caps: { thisClientPerDayUsdc: string; agentsWalletPerDayUsdc: string; hardPerDayUsdc: string }
  fundUrl: string
  explorerUrl: string
}

export async function walletStatus(deps: Pick<McpHireDeps, "store" | "rpc" | "caps" | "priceMicro" | "origin" | "now">, auth: AuthenticatedGrant): Promise<WalletStatus> {
  const { grant } = auth
  let balance: bigint | null = null
  try {
    balance = await getUsdcBalance(deps.rpc, grant.address)
  } catch {
    balance = null
  }
  const now = deps.now?.()
  const mine = await spentToday(deps.store, grantLedger(grant.id), now).catch(() => 0)
  const shared = await spentToday(deps.store, grant.uid, now).catch(() => 0)
  return {
    address: grant.address,
    balanceUsdc: balance === null ? null : microToUsdc(Number(balance)),
    priceUsdc: microToUsdc(deps.priceMicro),
    spentToday: { thisClientUsdc: microToUsdc(mine), agentsWalletUsdc: microToUsdc(shared) },
    caps: { thisClientPerDayUsdc: microToUsdc(grant.capMicro), agentsWalletPerDayUsdc: microToUsdc(deps.caps.perDayMicro), hardPerDayUsdc: microToUsdc(deps.caps.hardDayMicro) },
    fundUrl: walletPageUrl(deps.origin),
    explorerUrl: `https://explorer.solana.com/address/${grant.address}?cluster=devnet`,
  }
}
