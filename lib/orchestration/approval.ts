import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import type { KvStore } from "@/lib/security/kv-store"

// A hire that would go over the orchestrator's caps waits for the person. The approval is a
// signed, single-use token tied to the run that asked for it and to exactly one hire (who, what,
// how much), and it expires. The browser only carries it back; it cannot change what it approves.

export const APPROVAL_TTL_MS = 10 * 60 * 1000

export type ApprovalReason = "run" | "day"

export type ApprovalPayload = {
  v: 1
  /** Single-use id for this approval. */
  id: string
  runId: string
  /** The browser id whose agents' wallet will pay: another browser cannot use this approval. */
  owner: string
  fromId: string
  fromName: string
  toId: string
  toName: string
  task: string
  amountMicro: number
  reason: ApprovalReason
  /** Epoch ms. */
  exp: number
}

export type ApprovalSigner = {
  issue: (input: Omit<ApprovalPayload, "v" | "id" | "exp">, now?: number) => { token: string; payload: ApprovalPayload }
  verify: (token: string, runId: string, owner: string, now?: number) => { ok: true; payload: ApprovalPayload } | { ok: false; error: string }
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

/**
 * The HMAC key. ORCHESTRATOR_APPROVAL_SECRET when set; otherwise derived (domain-separated, never
 * the secret itself) from the cookie-sealing secret, which every deployment with agents'
 * wallets already has.
 */
export function approvalKeyFromEnv(env: Record<string, string | undefined> = process.env): Buffer | null {
  const explicit = env.ORCHESTRATOR_APPROVAL_SECRET?.trim()
  if (explicit && explicit.length >= 16) return createHash("sha256").update(`agentic-city:approval:${explicit}`).digest()
  const sealing = env.CONNECTIONS_SECRET?.trim() || env.BETTER_AUTH_SECRET?.trim()
  if (sealing) return createHash("sha256").update(`agentic-city:approval-from-sealing:${sealing}`).digest()
  return null
}

export function createApprovalSigner(key: Buffer, ttlMs: number = APPROVAL_TTL_MS): ApprovalSigner {
  const sign = (body: string) => createHmac("sha256", key).update(body).digest()

  return {
    issue(input, now = Date.now()) {
      const payload: ApprovalPayload = { ...input, task: input.task.slice(0, 2000), v: 1, id: randomUUID(), exp: now + ttlMs }
      const body = b64url(JSON.stringify(payload))
      return { token: `${body}.${b64url(sign(body))}`, payload }
    },
    verify(token, runId, owner, now = Date.now()) {
      if (typeof token !== "string" || token.length > 8192) return { ok: false, error: "Esta aprobación no es válida." }
      const [body, signature, extra] = token.split(".")
      if (!body || !signature || extra !== undefined) return { ok: false, error: "Esta aprobación no es válida." }
      const expected = sign(body)
      const given = Buffer.from(signature, "base64url")
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, error: "Esta aprobación no es válida." }
      let payload: ApprovalPayload
      try {
        payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ApprovalPayload
      } catch {
        return { ok: false, error: "Esta aprobación no es válida." }
      }
      if (payload.v !== 1 || typeof payload.id !== "string") return { ok: false, error: "Esta aprobación no es válida." }
      if (payload.runId !== runId) return { ok: false, error: "Esta aprobación es de otra conversación." }
      if (payload.owner !== owner) return { ok: false, error: "Esta aprobación es de otro navegador." }
      if (!(payload.exp > now)) return { ok: false, error: "Esta aprobación venció. Pedí la contratación de nuevo para recibir otra." }
      return { ok: true, payload }
    },
  }
}

/** Marks the approval as used. False when it was already used (a replay or a double click). */
export async function consumeApproval(store: KvStore, payload: ApprovalPayload, now: number = Date.now()): Promise<boolean> {
  const ttlSeconds = Math.max(60, Math.ceil((payload.exp - now) / 1000) + 60)
  return store.set(`orchestrator:approval:${payload.id}`, "used", ttlSeconds, { onlyIfAbsent: true })
}
