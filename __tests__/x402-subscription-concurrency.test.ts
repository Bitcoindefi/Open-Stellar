import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, unlinkSync } from 'node:fs'
import {
  saveX402SubscriptionStoreRecord,
  saveX402SubscriptionStoreRecordSync,
  readSubscriptions,
  resetX402SubscriptionStoreForTests,
} from '@/lib/protocols/x402-subscription-store'

describe('Subscription Store Concurrency & Storage', () => {
  const testDb = join(tmpdir(), `x402-subs-concurrency-${process.pid}-${Date.now()}.json`)

  beforeEach(() => {
    process.env.X402_SUBSCRIPTION_DB_PATH = testDb
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

  it('handles concurrent writeSubscriptions calls sequentially without corruption', async () => {
    const promises = Array.from({ length: 10 }).map((_, i) =>
      saveX402SubscriptionStoreRecord({
        id: `sub_${i}`,
        serviceId: `service-${i}`,
        agentId: `agent-${i}`,
        plan: 'starter',
        callsPerMonth: 100,
        callsUsed: i,
        pricePerMonth: '1 XLM',
        status: 'active',
        active: true,
        createdAt: new Date().toISOString(),
        renewsAt: new Date().toISOString(),
        lastChargedAt: new Date().toISOString(),
        billingEvents: [],
      })
    )

    await Promise.all(promises)
    const stored = readSubscriptions()
    expect(stored).toHaveLength(10)
  })

  it('persists subscription updates to disk durably', () => {
    saveX402SubscriptionStoreRecordSync({
      id: 'sub_flush_1',
      serviceId: 'oracle',
      agentId: 'agent-hot',
      plan: 'pro',
      callsPerMonth: 1000,
      callsUsed: 42,
      pricePerMonth: '20 XLM',
      status: 'active',
      active: true,
      createdAt: new Date().toISOString(),
      renewsAt: new Date().toISOString(),
      lastChargedAt: new Date().toISOString(),
      billingEvents: [],
    })

    const stored = readSubscriptions()
    expect(stored).toHaveLength(1)
    expect(stored[0].callsUsed).toBe(42)
  })
})
