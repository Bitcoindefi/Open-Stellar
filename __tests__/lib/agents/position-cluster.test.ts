import { describe, it, expect } from 'vitest'
import { clusterPositions } from '@/lib/agents/position-cluster'

describe('clusterPositions', () => {
  it('clusters 3 agents within 2km with gridSize=5 -> 1 cluster of 3', () => {
    const positions = [
      { agentId: 'a1', lat: 40.7300, lng: -73.9950 },
      { agentId: 'a2', lat: 40.7310, lng: -73.9960 },
      { agentId: 'a3', lat: 40.7320, lng: -73.9970 },
    ]
    const clusters = clusterPositions(positions, 5)
    expect(clusters.length).toBe(1)
    expect(clusters[0].count).toBe(3)
    expect(clusters[0].agentIds).toEqual(['a1', 'a2', 'a3'])
  })
})
