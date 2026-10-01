import { getKvStore } from "@/lib/security/kv-store"

// Registering an agent costs the treasury devnet SOL, so it is capped per owner and globally
// per UTC day, in the shared store (not per serverless instance).

export const REGISTRATION_LIMITS = { perOwnerPerDay: 5, globalPerDay: 100 } as const
const DAY_SECONDS = 24 * 60 * 60

export type RegistrationReservation =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; scope: "owner" | "global" }

function day(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export async function reserveRegistration(ownerTag: string, now: Date = new Date()): Promise<RegistrationReservation> {
  const store = getKvStore()
  const ownerKey = `ac:8004:register:${day(now)}:owner:${ownerTag}`
  const globalKey = `ac:8004:register:${day(now)}:global`

  if ((await store.incr(ownerKey, DAY_SECONDS)) > REGISTRATION_LIMITS.perOwnerPerDay) {
    await store.decr(ownerKey)
    return { ok: false, scope: "owner" }
  }
  if ((await store.incr(globalKey, DAY_SECONDS)) > REGISTRATION_LIMITS.globalPerDay) {
    await store.decr(globalKey)
    await store.decr(ownerKey)
    return { ok: false, scope: "global" }
  }
  let released = false
  return {
    ok: true,
    release: async () => {
      if (released) return
      released = true
      await store.decr(globalKey)
      await store.decr(ownerKey)
    },
  }
}
