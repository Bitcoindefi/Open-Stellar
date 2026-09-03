import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, unlinkSync } from 'node:fs'
import { POST } from '@/app/api/protocol/x402/subscriptions/renew/route'
import { createX402Subscription, resetX402SubscriptionsForTests } from '@/lib/protocols/x402'
import { resetX402SubscriptionStoreForTests } from '@/lib/protocols/x402-subscription-store'

describe('/api/protocol/x402/subscriptions/renew API Route', () => {
  const testDb = join(tmpdir(), `x402-subs-renew-${process.pid}-${Date.now()}.json`)

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

  it('triggers recurring renewals and returns summary', async () => {
    const pastDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    createX402Subscription({
      serviceId: 'data-oracle',
      agentId: 'agent-bot-77',
      plan: 'starter',
      now: pastDate,
    })

    const req = new Request('https://openstellar.org/api/protocol/x402/subscriptions/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        balances: {
          'agent-bot-77': 50,
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.renewedCount).toBe(1)
  })
})
