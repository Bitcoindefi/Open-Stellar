import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cwd } from 'node:process'
import type { X402Subscription } from '@/lib/protocols/x402'

const DEFAULT_DB_PATH = join(cwd(), '.data', 'x402-subscriptions.json')
const DB_PATH = process.env.X402_SUBSCRIPTION_DB_PATH || DEFAULT_DB_PATH

function ensureDb(): void {
  const dir = dirname(DB_PATH)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(DB_PATH)) {
    writeFileSync(DB_PATH, '[]\n', 'utf8')
  }
}

export function readSubscriptions(): X402Subscription[] {
  ensureDb()
  try {
    const raw = readFileSync(DB_PATH, 'utf8').trim()
    if (!raw) return []
    const parsed = JSON.parse(raw) as X402Subscription[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeSubscriptions(subscriptions: X402Subscription[]): void {
  ensureDb()
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(subscriptions, null, 2)}\n`, 'utf8')
  try {
    renameSync(tmpPath, DB_PATH)
  } catch {
    writeFileSync(DB_PATH, `${JSON.stringify(subscriptions, null, 2)}\n`, 'utf8')
    try {
      renameSync(tmpPath, `${tmpPath}.done`)
    } catch {
      /* best-effort cleanup */
    }
  }
}

export function saveX402SubscriptionStoreRecord(subscription: X402Subscription): X402Subscription {
  const subscriptions = readSubscriptions()
  const key = `${subscription.agentId}:${subscription.serviceId}`
  const filtered = subscriptions.filter((item) => `${item.agentId}:${item.serviceId}` !== key)
  const next = [subscription, ...filtered]
  writeSubscriptions(next)
  return subscription
}

export function resetX402SubscriptionStoreForTests(): void {
  writeSubscriptions([])
}
