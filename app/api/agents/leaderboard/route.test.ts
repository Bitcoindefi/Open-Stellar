import { describe, expect, it, beforeEach } from 'vitest'
import { GET } from './route'
import { applyReputationAction } from '@/lib/reputation/reputation-store'
import { recordXpEvent, resetXpLeaderboardStore } from '@/lib/agents/xp-leaderboard-store'

describe('Leaderboard API Route', () => {
  beforeEach(() => {
    resetXpLeaderboardStore()
  })

  it('ranks 3 agents correctly with total XP and weekly delta', async () => {
    const timestamp = Date.now()

    // Create unique agent IDs to avoid interference from other tests
    const agentA = `test-agent-a-${timestamp}`
    const agentB = `test-agent-b-${timestamp}`
    const agentC = `test-agent-c-${timestamp}`

    // Agent A: 50 delta XP, 20 weekly
    applyReputationAction({ actorId: agentA, delta: 50, reason: 'task', scope: 'tx' })
    recordXpEvent(agentA, 20, timestamp)

    // Agent B: 100 delta XP, no weekly
    applyReputationAction({ actorId: agentB, delta: 100, reason: 'task', scope: 'tx' })
    
    // Agent C: 10 delta XP, 10 weekly
    applyReputationAction({ actorId: agentC, delta: 10, reason: 'task', scope: 'tx' })
    recordXpEvent(agentC, 10, timestamp)

    const request = new Request('http://localhost/api/agents/leaderboard?period=weekly&limit=50')
    const response = await GET(request)
    const data = await response.json()

    expect(data.ok).toBe(true)
    
    // Filter just our test agents
    const entries = data.entries.filter((e: any) => [agentA, agentB, agentC].includes(e.agentId))

    // B (600) > A (550) > C (510)
    expect(entries[0].agentId).toBe(agentB)
    expect(entries[1].agentId).toBe(agentA)
    expect(entries[2].agentId).toBe(agentC)

    expect(entries[0].weeklyDelta).toBe(0)
    expect(entries[1].weeklyDelta).toBe(20)
    expect(entries[2].weeklyDelta).toBe(10)
  })
})
