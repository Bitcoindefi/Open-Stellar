import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cwd } from 'node:process'
import { randomBytes } from 'node:crypto'
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

let writeLock: Promise<void> = Promise.resolve()

function serializeWrite<T>(task: () => T | Promise<T>): Promise<T> {
  const next = writeLock.then(() => task())
  writeLock = next.then(
    () => undefined,
    () => undefined,
  )
  return next
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

export function writeSubscriptionsSync(subscriptions: X402Subscription[]): void {
  ensureDb()
  const uniqueId = `${Date.now()}_${randomBytes(4).toString('hex')}`
  const tmpPath = `${DB_PATH}.${process.pid}.${uniqueId}.tmp`
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

export async function writeSubscriptions(subscriptions: X402Subscription[]): Promise<void> {
  return serializeWrite(() => {
    writeSubscriptionsSync(subscriptions)
  })
}

export function saveX402SubscriptionStoreRecordSync(subscription: X402Subscription): X402Subscription {
  const subscriptions = readSubscriptions()
  const key = `${subscription.agentId}:${subscription.serviceId}`
  const filtered = subscriptions.filter((item) => `${item.agentId}:${item.serviceId}` !== key)
  const next = [subscription, ...filtered]
  writeSubscriptionsSync(next)
  return subscription
}

export async function saveX402SubscriptionStoreRecord(
  subscription: X402Subscription,
): Promise<X402Subscription> {
  return serializeWrite(() => saveX402SubscriptionStoreRecordSync(subscription))
}

export function resetX402SubscriptionStoreForTests(): void {
  writeSubscriptionsSync([])
}
