import { describe, expect, it } from 'vitest'

import { createLocalReputationAttestation } from '@/lib/reputation/attestation'
import type { ReputationSnapshot } from '@/lib/reputation/reputation-store'
import { createX402Quote } from './x402'

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
