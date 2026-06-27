import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createLocalReputationAttestation } from '@/lib/reputation/attestation'
import type { ReputationSnapshot } from '@/lib/reputation/reputation-store'
import {
  checkX402Subscription,
  createX402Quote,
  createX402Subscription,
  listX402Subscriptions,
  resetX402SubscriptionStorePathForTests,
  resetX402SubscriptionsForTests,
  setX402SubscriptionStorePathForTests,
} from './x402'

const reputation: ReputationSnapshot = {
  actorId: 'bot-silver',
  score: 250,
  tier: 'silver',
  updatedAt: '2026-06-26T00:00:00.000Z',
  metrics: {
    tasksCompleted: 250,
    x402RevenueXlm: 0,
    uptimeDaysWithoutErrors: 0,
    badges: [],
    infractions: 0,
  },
}

describe('x402 reputation gate', () => {
  it('rejects quotes when reputation attestation is below the required score', () => {
    const attestation = createLocalReputationAttestation(reputation)

    expect(() => createX402Quote({
      serviceId: 'high-value-service',
      chain: 'stellar',
      payer: 'bot-silver',
      units: 1,
      unitPriceUsd: 0.1,
      reputationGate: { minReputation: 500, tier: 'gold' },
      attestation,
    })).toThrow('Reputation too low for this service')
  })

  it('creates quotes when attestation satisfies the minimum reputation', () => {
    const attestation = createLocalReputationAttestation(reputation)
    const quote = createX402Quote({
      serviceId: 'silver-service',
      chain: 'stellar',
      payer: 'bot-silver',
      units: 1,
      unitPriceUsd: 0.1,
      reputationGate: { minReputation: 200, tier: 'silver' },
      attestation,
    })

    expect(quote.code).toBe(402)
    expect(quote.serviceId).toBe('silver-service')
  })
})

describe('x402 subscription persistence', () => {
  it('stores subscriptions on disk and reloads them for later reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-stellar-x402-subs-'))
    try {
      setX402SubscriptionStorePathForTests(join(dir, 'subscriptions.json'))
      resetX402SubscriptionsForTests()
      const subscription = createX402Subscription({
        serviceId: 'weather.v1',
        agentId: 'agent-nexus',
        plan: 'starter',
        walletBalanceXlm: 10,
      })

      expect(subscription.active).toBe(true)
      expect(listX402Subscriptions().subscriptions).toHaveLength(1)
      expect(checkX402Subscription('agent-nexus', 'weather.v1', { consumeCall: true }).callsRemaining).toBe(99)
      expect(listX402Subscriptions().subscriptions[0].callsUsed).toBe(1)
    } finally {
      resetX402SubscriptionStorePathForTests()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
