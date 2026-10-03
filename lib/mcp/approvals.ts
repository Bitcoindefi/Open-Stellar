import { createHash } from "node:crypto"
import type { KvStore } from "@/lib/security/kv-store"
import { TTL } from "@/lib/mcp/config"
import { newId } from "@/lib/mcp/crypto"

// A hire over an MCP client's caps is never paid on the spot: it becomes a pending approval
// the person opens in the browser where they approved the client (their cookie must match).
// Once approved, the client repeats the call with the approval id and that one hire runs,
// still under the browser's hard daily ceiling.

export type ApprovalReason = "grant" | "browser"
export type ApprovalStatus = "pending" | "approved" | "rejected"

export type McpApproval = {
  v: 1
  id: string
  grantId: string
  uid: string
  clientName: string
  agentId: string
  agentName: string
  taskHash: string
  taskPreview: string
  amountMicro: number
  reason: ApprovalReason
  capMicro: number
  status: ApprovalStatus
  createdAt: string
}

const key = (id: string) => `mcp:approval:${id}`
const usedKey = (id: string) => `mcp:approval-used:${id}`

export function taskHash(task: string): string {
  return createHash("sha256").update(task.trim()).digest("hex")
}

export async function createApproval(
  store: KvStore,
  input: Omit<McpApproval, "v" | "id" | "status" | "createdAt" | "taskHash" | "taskPreview"> & { task: string },
  now: Date = new Date(),
): Promise<McpApproval> {
  const { task, ...rest } = input
  const approval: McpApproval = { ...rest, v: 1, id: newId(), status: "pending", createdAt: now.toISOString(), taskHash: taskHash(task), taskPreview: task.trim().slice(0, 400) }
  await store.set(key(approval.id), JSON.stringify(approval), TTL.approvalSeconds)
  return approval
}

export async function getApproval(store: KvStore, id: unknown): Promise<McpApproval | null> {
  if (typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id)) return null
  const raw = await store.get(key(id))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as McpApproval
    return value.v === 1 ? value : null
  } catch {
    return null
  }
}

/** The person's decision, from the browser that owns the grant. Only a pending approval changes. */
export async function decideApproval(store: KvStore, id: unknown, uid: string, decision: "approve" | "reject"): Promise<{ ok: true; approval: McpApproval } | { ok: false; error: string }> {
  const approval = await getApproval(store, id)
  if (!approval) return { ok: false, error: "Esta aprobación no existe o ya venció (duran 15 minutos)." }
  if (approval.uid !== uid) return { ok: false, error: "Abrí este enlace en el navegador donde conectaste el cliente MCP." }
  if (approval.status !== "pending") return { ok: false, error: approval.status === "approved" ? "Ya la aprobaste." : "Ya la rechazaste." }
  const next: McpApproval = { ...approval, status: decision === "approve" ? "approved" : "rejected" }
  await store.set(key(approval.id), JSON.stringify(next), TTL.approvalSeconds)
  return { ok: true, approval: next }
}

export type ApprovalUse = { ok: true; approval: McpApproval } | { ok: false; message: string }

/** Uses an approved approval for exactly the hire it was issued for, once. */
export async function redeemApproval(store: KvStore, id: string, expected: { grantId: string; agentId: string; task: string }, approveUrl: string): Promise<ApprovalUse> {
  const approval = await getApproval(store, id)
  if (!approval || approval.grantId !== expected.grantId) return { ok: false, message: "That approval does not exist or expired (they last 15 minutes). Call hire_agent again without approvalId to request a new one." }
  if (approval.agentId !== expected.agentId || approval.taskHash !== taskHash(expected.task)) {
    return { ok: false, message: "That approval was for a different agent or task. Repeat the exact same agentId and task, or request a new approval." }
  }
  if (approval.status === "pending") return { ok: false, message: `The person has not approved this hire yet. Ask them to open ${approveUrl} in the browser where they connected this client, then call hire_agent again with the same approvalId.` }
  if (approval.status === "rejected") return { ok: false, message: "The person rejected this hire in the browser. Nothing was paid; do not retry it." }
  const fresh = await store.set(usedKey(approval.id), "1", TTL.approvalSeconds, { onlyIfAbsent: true })
  if (!fresh) return { ok: false, message: "That approval was already used for a hire. Nothing more was paid." }
  return { ok: true, approval }
}

/** Gives a used approval back when the hire it unlocked did not move any money. */
export async function releaseApproval(store: KvStore, id: string): Promise<void> {
  await store.del(usedKey(id))
}
