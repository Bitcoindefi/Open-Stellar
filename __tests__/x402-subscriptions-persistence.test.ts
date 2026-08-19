import { describe, expect, it, beforeEach } from 'vitest'
import {
  createX402Subscription,
  checkX402Subscription,
  renewX402Subscriptions,
  resetX402SubscriptionsForTests,
} from '@/lib/protocols/x402'
import {
  readSubscriptions,
  flushSubscriptionsToDisk,
  resetX402SubscriptionStoreForTests,
} from '@/lib/protocols/x402-subscription-store'

describe('x402 Subscriptions Persistence', () => {
  beforeEach(() => {
    resetX402SubscriptionsForTests()
    resetX402SubscriptionStoreForTests()
  })

  it('persists subscriptions to disk and restores them on reload', async () => {
    createX402Subscription({
      serviceId: 'oracle-service',
      agentId: 'agent-bot-42',
      plan: 'starter',
      callsPerMonth: 50,
      walletBalanceXlm: 10,
    })

    await flushSubscriptionsToDisk()

    const onDisk = readSubscriptions()
    expect(onDisk.length).toBe(1)
    expect(onDisk[0].agentId).toBe('agent-bot-42')
    expect(onDisk[0].serviceId).toBe('oracle-service')
    expect(onDisk[0].callsPerMonth).toBe(50)

    // Consume a call
    const consumed = checkX402Subscription('agent-bot-42', 'oracle-service', { consumeCall: true })
    expect(consumed.callsRemaining).toBe(49)

    await flushSubscriptionsToDisk()

    const updatedDisk = readSubscriptions()
    expect(updatedDisk[0].callsUsed).toBe(1)
  })

  it('handles recurring renewal billing cycle deductions', async () => {
    const pastDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    createX402Subscription({
      serviceId: 'oracle-service',
      agentId: 'agent-bot-42',
      plan: 'starter',
      callsPerMonth: 50,
      now: pastDate,
    })

    await flushSubscriptionsToDisk()

    // Trigger recurring renewal
    const result = renewX402Subscriptions(new Date(), { 'agent-bot-42': 100 })
    expect(result.renewed.length).toBe(1)
    expect(result.renewed[0].billingEvents.length).toBeGreaterThan(1)
  })
})
