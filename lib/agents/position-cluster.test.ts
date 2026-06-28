import { describe, it, expect } from 'vitest'
import { clusterPositions } from './position-cluster'

describe('clusterPositions', () => {
  it('groups 3 agents within 2km with gridSize=5 into 1 cluster of 3', () => {
    // 1 degree of latitude is ~111km. 2km is ~0.018 degrees.
    const positions = [
      { agentId: 'agent1', lat: 40.7128, lng: -74.0060 },
      { agentId: 'agent2', lat: 40.7130, lng: -74.0060 }, // ~22 meters away
      { agentId: 'agent3', lat: 40.7128, lng: -74.0080 }, // ~168 meters away
    ]

    const clusters = clusterPositions(positions, 5)

    expect(clusters).toHaveLength(1)
    expect(clusters[0].count).toBe(3)
    expect(clusters[0].agentIds).toEqual(['agent1', 'agent2', 'agent3'])
  })
})
