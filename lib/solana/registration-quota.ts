import { createHash } from "node:crypto"
import { getKvStore } from "@/lib/security/kv-store"

// Registering an agent costs the treasury devnet SOL, so it is capped per owner, per client IP
// and globally per UTC day, in the shared store (not per serverless instance). Owners are
// anonymous browser ids that anyone can mint by clearing cookies, so the IP and global caps are
// what actually bound the spend.

export const REGISTRATION_LIMITS = { perOwnerPerDay: 5, perIpPerDay: 20, globalPerDay: 100 } as const
const DAY_SECONDS = 24 * 60 * 60

export type RegistrationScope = "owner" | "ip" | "global"

export type RegistrationReservation =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; scope: RegistrationScope }

function day(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function ipKey(ip: string): string {
  // Hashed so raw IPs are not kept in the store.
  return createHash("sha256").update(`agentic-city:register-ip:${ip}`).digest("hex").slice(0, 24)
}

export async function reserveRegistration(ownerTag: string, clientIp: string | null = null, now: Date = new Date()): Promise<RegistrationReservation> {
  const store = getKvStore()
  const windows: Array<{ key: string; max: number; scope: RegistrationScope }> = [
    { key: `ac:8004:register:${day(now)}:owner:${ownerTag}`, max: REGISTRATION_LIMITS.perOwnerPerDay, scope: "owner" },
  ]
  if (clientIp) windows.push({ key: `ac:8004:register:${day(now)}:ip:${ipKey(clientIp)}`, max: REGISTRATION_LIMITS.perIpPerDay, scope: "ip" })
  windows.push({ key: `ac:8004:register:${day(now)}:global`, max: REGISTRATION_LIMITS.globalPerDay, scope: "global" })

  const taken: string[] = []
  for (const window of windows) {
    const count = await store.incr(window.key, DAY_SECONDS)
    taken.push(window.key)
    if (count > window.max) {
      for (const key of taken) await store.decr(key)
      return { ok: false, scope: window.scope }
    }
  }
  let released = false
  return {
    ok: true,
    release: async () => {
      if (released) return
      released = true
      for (const key of taken) await store.decr(key)
    },
  }
}
