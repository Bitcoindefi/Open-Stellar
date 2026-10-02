import { createHash } from "node:crypto"
import type { KvStore } from "@/lib/security/kv-store"

// Rate limits for the agents' wallet routes, counted in the shared store so they hold across
// serverless instances. Store errors propagate: a route that moves money fails closed.

export type WindowLimit = { key: string; max: number; windowSeconds: number }

export const WALLET_LIMITS = {
  /** Balance reads hit the RPC; a panel refreshing every few seconds stays well under this. */
  balancePerBrowserPerMinute: 30,
  /** Withdrawals cost the server a network fee each. */
  withdrawPerBrowserPerHour: 3,
  withdrawGlobalPerDay: 300,
  /** Sponsored funding: the server pays the fee and, once per new wallet, about 0.002 SOL of rent. */
  fundPerBrowserPerHour: 6,
  fundPerIpPerDay: 40,
  fundGlobalPerDay: 400,
} as const

/**
 * Counts one hit against every window, in order. When one is over, the hits taken so far are
 * given back and its key is returned, so a refused request does not use up the other windows.
 */
export async function takeLimits(store: KvStore, limits: WindowLimit[]): Promise<{ ok: true } | { ok: false; key: string }> {
  const taken: string[] = []
  for (const limit of limits) {
    const count = await store.incr(limit.key, limit.windowSeconds)
    taken.push(limit.key)
    if (count > limit.max) {
      for (const key of taken) await store.decr(key)
      return { ok: false, key: limit.key }
    }
  }
  return { ok: true }
}

export function balanceLimits(uid: string, now: Date = new Date()): WindowLimit[] {
  const minute = Math.floor(now.getTime() / 60_000)
  return [{ key: `agent-wallet:balance:${uid}:${minute}`, max: WALLET_LIMITS.balancePerBrowserPerMinute, windowSeconds: 90 }]
}

export function fundLimits(uid: string, clientIp: string | null, now: Date = new Date()): WindowLimit[] {
  const hour = Math.floor(now.getTime() / 3_600_000)
  const day = now.toISOString().slice(0, 10)
  const limits: WindowLimit[] = [{ key: `agent-wallet:fund:${uid}:${hour}`, max: WALLET_LIMITS.fundPerBrowserPerHour, windowSeconds: 60 * 60 + 60 }]
  if (clientIp) {
    const ip = createHash("sha256").update(`agentic-city:fund-ip:${clientIp}`).digest("hex").slice(0, 24)
    limits.push({ key: `agent-wallet:fund:ip:${ip}:${day}`, max: WALLET_LIMITS.fundPerIpPerDay, windowSeconds: 26 * 60 * 60 })
  }
  limits.push({ key: `agent-wallet:fund:global:${day}`, max: WALLET_LIMITS.fundGlobalPerDay, windowSeconds: 26 * 60 * 60 })
  return limits
}

export function withdrawLimits(uid: string, now: Date = new Date()): WindowLimit[] {
  const hour = Math.floor(now.getTime() / 3_600_000)
  const day = now.toISOString().slice(0, 10)
  return [
    { key: `agent-wallet:withdraw:${uid}:${hour}`, max: WALLET_LIMITS.withdrawPerBrowserPerHour, windowSeconds: 60 * 60 + 60 },
    { key: `agent-wallet:withdraw:global:${day}`, max: WALLET_LIMITS.withdrawGlobalPerDay, windowSeconds: 26 * 60 * 60 },
  ]
}
