import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, unlinkSync } from 'node:fs'
import {
  createX402Subscription,
  checkX402Subscription,
  renewX402Subscriptions,
  resetX402SubscriptionsForTests,
} from '@/lib/protocols/x402'
import {
  readSubscriptions,
  resetX402SubscriptionStoreForTests,
} from '@/lib/protocols/x402-subscription-store'

describe('x402 Subscriptions Persistence', () => {
  const testDb = join(tmpdir(), `x402-subs-persistence-${process.pid}-${Date.now()}.json`)

  beforeEach(() => {
    process.env.X402_SUBSCRIPTION_DB_PATH = testDb
    resetX402SubscriptionsForTests()
    resetX402SubscriptionStoreForTests()
  })

  afterAll(() => {
    delete process.env.X402_SUBSCRIPTION_DB_PATH
    try {
      if (existsSync(testDb)) unlinkSync(testDb)
    } catch {
      /* best effort cleanup */
    }
  })

  it('persists subscriptions to disk and restores them on reload', () => {
    createX402Subscription({
      serviceId: 'oracle-service',
      agentId: 'agent-bot-42',
      plan: 'starter',
      callsPerMonth: 50,
      walletBalanceXlm: 10,
    })

    const onDisk = readSubscriptions()
    expect(onDisk).toHaveLength(1)
    expect(onDisk[0].agentId).toBe('agent-bot-42')
    expect(onDisk[0].serviceId).toBe('oracle-service')
    expect(onDisk[0].callsPerMonth).toBe(50)

    // Consume a call
    const consumed = checkX402Subscription('agent-bot-42', 'oracle-service', { consumeCall: true })
    expect(consumed.callsRemaining).toBe(49)

    const updatedDisk = readSubscriptions()
    expect(updatedDisk[0].callsUsed).toBe(1)
  })

  it('handles recurring renewal billing cycle deductions', () => {
    const pastDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    createX402Subscription({
      serviceId: 'oracle-service',
      agentId: 'agent-bot-42',
      plan: 'starter',
      callsPerMonth: 50,
      now: pastDate,
    })

    // Trigger recurring renewal
    const result = renewX402Subscriptions(new Date(), { 'agent-bot-42': 100 })
    expect(result.renewed).toHaveLength(1)
    expect(result.renewed[0].billingEvents.length).toBeGreaterThan(1)
  })
})
