import { join } from 'node:path'
import { cwd } from 'node:process'
import type { X402Subscription } from '@/lib/protocols/x402'
import { makeJsonStore } from '@/lib/protocols/x402-store-utils'

const DB_PATH = process.env.X402_SUBSCRIPTION_DB_PATH ?? join(cwd(), '.data', 'x402-subscriptions.json')
const store = makeJsonStore<X402Subscription>(DB_PATH)

export function readSubscriptions(): X402Subscription[] {
  return store.read()
}

export function writeSubscriptions(subscriptions: X402Subscription[]): void {
  store.write(subscriptions)
}

export function saveX402SubscriptionStore(subscription: X402Subscription): X402Subscription {
  const subscriptions = store.read()
  const key = `${subscription.agentId}:${subscription.serviceId}`
  const filtered = subscriptions.filter((s) => `${s.agentId}:${s.serviceId}` !== key && s.id !== subscription.id)
  store.write([subscription, ...filtered])
  return subscription
}

export function getX402SubscriptionStore(agentId: string, serviceId: string): X402Subscription | undefined {
  const key = `${agentId.trim()}:${serviceId.trim()}`
  return store.read().find((s) => `${s.agentId}:${s.serviceId}` === key)
}

export function resetX402SubscriptionStoreForTests(): void {
  store.reset()
}
