import { afterEach, describe, expect, it } from 'vitest'

import { recordAgentHeartbeat, resetAgentHealthStore } from '@/lib/agents/agent-health-store'
import { resetAgentUptimeStore } from '@/lib/agents/agent-uptime-store'
import { calculateReputationScore, getReputation, getReputationTier } from './reputation-store'

afterEach(() => {
  resetAgentHealthStore()
  resetAgentUptimeStore()
})

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
    })).toBe(1000)
  })

  it('maps thresholds to tiers', () => {
    expect(getReputationTier(49)).toBe('unrated')
    expect(getReputationTier(50)).toBe('bronze')
    expect(getReputationTier(200)).toBe('silver')
    expect(getReputationTier(500)).toBe('gold')
    expect(getReputationTier(1000)).toBe('platinum')
  })

  it('uses heartbeat-derived uptime days when computing an agent reputation', () => {
    const dayMs = 24 * 60 * 60 * 1000
    const nowMs = Date.now()

    recordAgentHeartbeat('rep-uptime-agent', {
      status: 'active',
      nowMs: nowMs - 2 * dayMs,
    })
    recordAgentHeartbeat('rep-uptime-agent', {
      status: 'active',
      nowMs: nowMs - dayMs,
    })
    recordAgentHeartbeat('rep-uptime-agent', {
      status: 'active',
      nowMs,
    })

    const reputation = getReputation('rep-uptime-agent')

    expect(reputation.metrics.uptimeDaysWithoutErrors).toBe(3)
    expect(reputation.score).toBe(506)
  })
})
