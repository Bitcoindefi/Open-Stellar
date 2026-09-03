import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cwd } from 'node:process'
import { randomBytes } from 'node:crypto'
import type { X402Subscription } from '@/lib/protocols/x402'

const DEFAULT_DB_PATH = join(cwd(), '.data', 'x402-subscriptions.json')

function getDbPath(): string {
  return process.env.X402_SUBSCRIPTION_DB_PATH || DEFAULT_DB_PATH
}

function ensureDb(): void {
  const dbPath = getDbPath()
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, '[]\n', 'utf8')
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
  const dbPath = getDbPath()
  try {
    const raw = readFileSync(dbPath, 'utf8').trim()
    if (!raw) return []
    const parsed = JSON.parse(raw) as X402Subscription[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeSubscriptionsSync(subscriptions: X402Subscription[]): void {
  ensureDb()
  const dbPath = getDbPath()
  const uniqueId = `${Date.now()}_${randomBytes(4).toString('hex')}`
  const tmpPath = `${dbPath}.${process.pid}.${uniqueId}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(subscriptions, null, 2)}\n`, 'utf8')
  try {
    renameSync(tmpPath, dbPath)
  } catch {
    writeFileSync(dbPath, `${JSON.stringify(subscriptions, null, 2)}\n`, 'utf8')
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath)
      }
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
  writeLock = Promise.resolve()
  writeSubscriptionsSync([])
}

