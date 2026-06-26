import { describe, expect, it } from 'vitest'

import { createLocalReputationAttestation, verifyLocalReputationAttestation } from './attestation'
import type { ReputationSnapshot } from './reputation-store'

const snapshot: ReputationSnapshot = {
  actorId: 'bot-7',
  score: 245,
  tier: 'silver',
  updatedAt: '2026-06-26T00:00:00.000Z',
  metrics: {
    tasksCompleted: 200,
    x402RevenueXlm: 3,
    uptimeDaysWithoutErrors: 5,
    badges: [{ id: 'rare-builder', rarity: 'rare', awardedAt: '2026-06-26T00:00:00.000Z' }],
    infractions: 0,
  },
}

describe('reputation attestation', () => {
  it('creates a deterministic 64-byte hash and verifies score gates', () => {
    const attestation = createLocalReputationAttestation(snapshot)

    expect(attestation.hash).toMatch(/^[a-f0-9]{128}$/)
    expect(verifyLocalReputationAttestation('bot-7', 200, attestation)).toBe(true)
    expect(verifyLocalReputationAttestation('bot-7', 500, attestation)).toBe(false)
    expect(verifyLocalReputationAttestation('bot-8', 200, attestation)).toBe(false)
  })
})
