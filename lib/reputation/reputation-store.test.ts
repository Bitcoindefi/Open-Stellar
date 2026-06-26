import { describe, expect, it } from 'vitest'

import { calculateReputationScore, getReputationTier } from './reputation-store'

describe('reputation scoring', () => {
  it('calculates weighted scores with caps and penalties', () => {
    expect(calculateReputationScore({
      tasksCompleted: 900,
      x402RevenueXlm: 90,
      uptimeDaysWithoutErrors: 200,
      badges: [
        { id: 'rare-builder', rarity: 'rare', awardedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'legend', rarity: 'legendary', awardedAt: '2026-01-01T00:00:00.000Z' },
      ],
      infractions: 2,
    })).toBe(1300)
  })

  it('maps thresholds to tiers', () => {
    expect(getReputationTier(49)).toBe('unrated')
    expect(getReputationTier(50)).toBe('bronze')
    expect(getReputationTier(200)).toBe('silver')
    expect(getReputationTier(500)).toBe('gold')
    expect(getReputationTier(1000)).toBe('platinum')
  })
})
