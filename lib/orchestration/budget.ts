import type { KvStore } from "@/lib/security/kv-store"

// Spending caps for each browser's agents' wallet: what its agents may spend hiring each other
// without asking. The money is the person's own, the caps keep a runaway run from spending it.
// Amounts are kept in micro-USDC (6 decimals), the unit the x402 requirements use on-chain.

export const USDC_DECIMALS = 6
const MICRO_PER_USDC = 10 ** USDC_DECIMALS
/** The ledger counts in steps of 0.01 USDC so it can use an atomic INCR (one step per agent task). */
export const LEDGER_STEP_MICRO = 10_000

export const DEFAULT_MAX_USDC_PER_RUN = "0.05"
export const DEFAULT_MAX_USDC_PER_DAY = "0.5"
/** Even an approved hire stops here: a person clicking approve is not a blank cheque. */
export const DEFAULT_HARD_MAX_USDC_PER_DAY = "2"

export type OrchestratorCaps = {
  perRunMicro: number
  perDayMicro: number
  hardDayMicro: number
}

/** "$0.01", "0.05" or 0.5 to micro-USDC. Returns null for anything that is not a non-negative amount. */
export function usdcToMicro(value: string | number): number | null {
  const text = String(value).trim().replace(/^\$/, "")
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null
  const [whole, fraction = ""] = text.split(".")
  return Number(whole) * MICRO_PER_USDC + Number(fraction.padEnd(USDC_DECIMALS, "0"))
}

/** Micro-USDC to a short decimal string: 10000 -> "0.01". */
export function microToUsdc(micro: number): string {
  const sign = micro < 0 ? "-" : ""
  const abs = Math.abs(Math.round(micro))
  const whole = Math.floor(abs / MICRO_PER_USDC)
  const fraction = String(abs % MICRO_PER_USDC).padStart(USDC_DECIMALS, "0").replace(/0+$/, "")
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`
}

function capFromEnv(raw: string | undefined, fallback: string): number {
  const parsed = raw ? usdcToMicro(raw) : null
  return parsed ?? (usdcToMicro(fallback) as number)
}

export function readCaps(env: Record<string, string | undefined> = process.env): OrchestratorCaps {
  const perRunMicro = capFromEnv(env.ORCHESTRATOR_MAX_USDC_PER_RUN, DEFAULT_MAX_USDC_PER_RUN)
  const perDayMicro = capFromEnv(env.ORCHESTRATOR_MAX_USDC_PER_DAY, DEFAULT_MAX_USDC_PER_DAY)
  const hardDayMicro = Math.max(perDayMicro, capFromEnv(env.ORCHESTRATOR_HARD_MAX_USDC_PER_DAY, DEFAULT_HARD_MAX_USDC_PER_DAY))
  return { perRunMicro, perDayMicro, hardDayMicro }
}

/** One ledger per browser (its agents' wallet) and UTC day. */
export function dayLedgerKey(owner: string, now: Date = new Date()): string {
  return `orchestrator:spend:${owner}:${now.toISOString().slice(0, 10)}`
}

function steps(amountMicro: number): number {
  return Math.max(1, Math.ceil(amountMicro / LEDGER_STEP_MICRO))
}

export type Reservation = { ok: true; key: string; amountMicro: number } | { ok: false; spentMicro: number }

/**
 * Reserves `amountMicro` of today's budget before paying. Counted with INCR so two instances
 * paying at once cannot both slip under the cap; a reservation that would cross `limitMicro`
 * is undone and refused. Store errors propagate: a ledger that cannot be read refuses to spend.
 */
export async function reserveDaily(store: KvStore, owner: string, amountMicro: number, limitMicro: number, now: Date = new Date()): Promise<Reservation> {
  const key = dayLedgerKey(owner, now)
  const count = steps(amountMicro)
  let total = 0
  for (let i = 0; i < count; i++) total = await store.incr(key, 60 * 60 * 26)
  if (total * LEDGER_STEP_MICRO > limitMicro) {
    for (let i = 0; i < count; i++) await store.decr(key)
    return { ok: false, spentMicro: (total - count) * LEDGER_STEP_MICRO }
  }
  return { ok: true, key, amountMicro }
}

/** Gives a reservation back when the payment did not happen. */
export async function releaseDaily(store: KvStore, reservation: { key: string; amountMicro: number }): Promise<void> {
  for (let i = 0; i < steps(reservation.amountMicro); i++) await store.decr(reservation.key)
}

export async function spentToday(store: KvStore, owner: string, now: Date = new Date()): Promise<number> {
  const value = Number(await store.get(dayLedgerKey(owner, now)))
  return Number.isFinite(value) && value > 0 ? value * LEDGER_STEP_MICRO : 0
}
