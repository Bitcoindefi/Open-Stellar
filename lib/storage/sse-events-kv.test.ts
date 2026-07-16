import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { kv } from '@vercel/kv'
import type { PublishedSystemEvent } from '@/lib/events/system-events'
import {
  initializeSSEEventStorage,
  saveSSEEvent,
  getSSEEvent,
  getRecentGlobalEvents,
  getRecentAgentEvents,
  getRecentEventsByType,
  getEventsInRange,
  getSSEEventStats,
  cleanupOldEvents,
  resetSSEEventStorageForTests,
} from './sse-events-kv'

// Mock the kv module
vi.mock('@vercel/kv', () => ({
  kv: {
    setnx: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    zadd: vi.fn(),
    expire: vi.fn(),
    zrevrange: vi.fn(),
    zrangebyscore: vi.fn(),
    zcard: vi.fn(),
    keys: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    zremrangebyscore: vi.fn(),
  },
}))

describe('SSE events KV storage', () => {
  const mockEvent: PublishedSystemEvent = {
    id: 'test-event-1',
    type: 'agent.status',
    agentId: 'agent-123',
    occurredAt: '2024-01-15T10:30:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initializeSSEEventStorage', () => {
    it('initializes counters successfully', async () => {
      vi.mocked(kv.setnx).mockResolvedValue('OK')

      await expect(initializeSSEEventStorage()).resolves.not.toThrow()

      expect(kv.setnx).toHaveBeenCalledTimes(2)
      expect(kv.setnx).toHaveBeenCalledWith('sse:events:latest_id', '0')
      expect(kv.setnx).toHaveBeenCalledWith('sse:events:count', '0')
    })

    it('handles initialization errors gracefully', async () => {
      vi.mocked(kv.setnx).mockRejectedValue(new Error('KV connection failed'))

      await expect(initializeSSEEventStorage()).rejects.toThrow('KV connection failed')
    })
  })

  describe('saveSSEEvent', () => {
    it('saves event to all required storage locations', async () => {
      vi.mocked(kv.set).mockResolvedValue('OK')
      vi.mocked(kv.zadd).mockResolvedValue(1)
      vi.mocked(kv.expire).mockResolvedValue(1)
      vi.mocked(kv.incr).mockResolvedValue(1)

      await expect(saveSSEEvent(mockEvent)).resolves.not.toThrow()

      expect(kv.set).toHaveBeenCalledWith(
        'sse:event:test-event-1',
        JSON.stringify(mockEvent),
        expect.objectContaining({ ex: expect.any(Number) })
      )
      expect(kv.zadd).toHaveBeenCalledWith('sse:events:global', {
        score: expect.any(Number),
        member: 'test-event-1',
      })
      expect(kv.zadd).toHaveBeenCalledWith('sse:events:agent:agent-123', {
        score: expect.any(Number),
        member: 'test-event-1',
      })
      expect(kv.zadd).toHaveBeenCalledWith('sse:events:type:agent.status', {
        score: expect.any(Number),
        member: 'test-event-1',
      })
    })

    it('handles non-agent-scoped events correctly', async () => {
      const nonAgentEvent: PublishedSystemEvent = {
        id: 'test-event-2',
        type: 'district.unlocked',
        occurredAt: '2024-01-15T10:30:00.000Z',
      }

      vi.mocked(kv.set).mockResolvedValue('OK')
      vi.mocked(kv.zadd).mockResolvedValue(1)
      vi.mocked(kv.expire).mockResolvedValue(1)
      vi.mocked(kv.incr).mockResolvedValue(1)

      await expect(saveSSEEvent(nonAgentEvent)).resolves.not.toThrow()

      // Should not call zadd for agent-specific stream
      expect(kv.zadd).not.toHaveBeenCalledWith(
        'sse:events:agent:',
        expect.anything()
      )
    })

    it('handles save errors gracefully', async () => {
      vi.mocked(kv.set).mockRejectedValue(new Error('Save failed'))

      await expect(saveSSEEvent(mockEvent)).rejects.toThrow('Save failed')
    })
  })

  describe('getSSEEvent', () => {
    it('retrieves event by ID', async () => {
      vi.mocked(kv.get).mockResolvedValue(JSON.stringify(mockEvent))

      const result = await getSSEEvent('test-event-1')

      expect(result).toEqual(mockEvent)
      expect(kv.get).toHaveBeenCalledWith('sse:event:test-event-1')
    })

    it('returns null for non-existent event', async () => {
      vi.mocked(kv.get).mockResolvedValue(null)

      const result = await getSSEEvent('non-existent')

      expect(result).toBeNull()
    })

    it('handles get errors gracefully', async () => {
      vi.mocked(kv.get).mockRejectedValue(new Error('Get failed'))

      await expect(getSSEEvent('test-event-1')).rejects.toThrow('Get failed')
    })
  })

  describe('getRecentGlobalEvents', () => {
    it('retrieves recent events from global stream', async () => {
      vi.mocked(kv.zrevrange).mockResolvedValue(['test-event-1', 'test-event-2'])
      vi.mocked(kv.get)
        .mockResolvedValueOnce(JSON.stringify(mockEvent))
        .mockResolvedValueOnce(JSON.stringify({ ...mockEvent, id: 'test-event-2' }))

      const result = await getRecentGlobalEvents(10)

      expect(result).toHaveLength(2)
      expect(kv.zrevrange).toHaveBeenCalledWith('sse:events:global', 0, 9)
    })

    it('returns empty array when no events exist', async () => {
      vi.mocked(kv.zrevrange).mockResolvedValue([])

      const result = await getRecentGlobalEvents()

      expect(result).toEqual([])
    })

    it('handles errors gracefully', async () => {
      vi.mocked(kv.zrevrange).mockRejectedValue(new Error('Query failed'))

      await expect(getRecentGlobalEvents()).rejects.toThrow('Query failed')
    })
  })

  describe('getRecentAgentEvents', () => {
    it('retrieves recent events for specific agent', async () => {
      vi.mocked(kv.zrevrange).mockResolvedValue(['test-event-1'])
      vi.mocked(kv.get).mockResolvedValue(JSON.stringify(mockEvent))

      const result = await getRecentAgentEvents('agent-123', 10)

      expect(result).toHaveLength(1)
      expect(kv.zrevrange).toHaveBeenCalledWith('sse:events:agent:agent-123', 0, 9)
    })

    it('returns empty array when agent has no events', async () => {
      vi.mocked(kv.zrevrange).mockResolvedValue([])

      const result = await getRecentAgentEvents('agent-456')

      expect(result).toEqual([])
    })
  })

  describe('getRecentEventsByType', () => {
    it('retrieves recent events of specific type', async () => {
      vi.mocked(kv.zrevrange).mockResolvedValue(['test-event-1'])
      vi.mocked(kv.get).mockResolvedValue(JSON.stringify(mockEvent))

      const result = await getRecentEventsByType('agent.status', 10)

      expect(result).toHaveLength(1)
      expect(kv.zrevrange).toHaveBeenCalledWith('sse:events:type:agent.status', 0, 9)
    })

    it('returns empty array when type has no events', async () => {
      vi.mocked(kv.zrevrange).mockResolvedValue([])

      const result = await getRecentEventsByType('non.existent.type')

      expect(result).toEqual([])
    })
  })

  describe('getEventsInRange', () => {
    it('retrieves events within time range', async () => {
      const startTime = Date.now() - 3600000 // 1 hour ago
      const endTime = Date.now()

      vi.mocked(kv.zrangebyscore).mockResolvedValue(['test-event-1'])
      vi.mocked(kv.get).mockResolvedValue(JSON.stringify(mockEvent))

      const result = await getEventsInRange(startTime, endTime, 10)

      expect(result).toHaveLength(1)
      expect(kv.zrangebyscore).toHaveBeenCalledWith(
        'sse:events:global',
        startTime,
        endTime,
        expect.objectContaining({ rev: true, count: 10 })
      )
    })

    it('returns empty array when no events in range', async () => {
      vi.mocked(kv.zrangebyscore).mockResolvedValue([])

      const result = await getEventsInRange(0, 1000)

      expect(result).toEqual([])
    })
  })

  describe('getSSEEventStats', () => {
    it('returns event statistics', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce('100')
        .mockResolvedValueOnce('test-event-100')
      vi.mocked(kv.zcard).mockResolvedValue(100)
      vi.mocked(kv.keys)
        .mockResolvedValueOnce(['sse:events:agent:1', 'sse:events:agent:2'])
        .mockResolvedValueOnce(['sse:events:type:1', 'sse:events:type:2'])

      const result = await getSSEEventStats()

      expect(result.totalEvents).toBe(100)
      expect(result.latestEventId).toBe('test-event-100')
      expect(result.streamSizes.global).toBe(100)
      expect(result.streamSizes.byAgent).toBe(2)
      expect(result.streamSizes.byType).toBe(2)
    })

    it('handles missing stats gracefully', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
      vi.mocked(kv.zcard).mockResolvedValue(0)
      vi.mocked(kv.keys).mockResolvedValue([])

      const result = await getSSEEventStats()

      expect(result.totalEvents).toBe(0)
      expect(result.latestEventId).toBe('')
      expect(result.streamSizes.global).toBe(0)
    })
  })

  describe('cleanupOldEvents', () => {
    it('removes events older than specified time', async () => {
      vi.mocked(kv.zremrangebyscore).mockResolvedValue(50)

      const result = await cleanupOldEvents(3600000) // 1 hour

      expect(result).toBe(50)
      expect(kv.zremrangebyscore).toHaveBeenCalledWith(
        'sse:events:global',
        0,
        expect.any(Number)
      )
    })

    it('handles cleanup errors gracefully', async () => {
      vi.mocked(kv.zremrangebyscore).mockRejectedValue(new Error('Cleanup failed'))

      await expect(cleanupOldEvents()).rejects.toThrow('Cleanup failed')
    })
  })

  describe('resetSSEEventStorageForTests', () => {
    it('clears all SSE keys and reinitializes', async () => {
      vi.mocked(kv.keys).mockResolvedValue(['sse:events:global', 'sse:event:test'])
      vi.mocked(kv.del).mockResolvedValue(1)
      vi.mocked(kv.setnx).mockResolvedValue('OK')

      await expect(resetSSEEventStorageForTests()).resolves.not.toThrow()

      expect(kv.del).toHaveBeenCalledWith('sse:events:global', 'sse:event:test')
      expect(kv.setnx).toHaveBeenCalledTimes(2)
    })

    it('handles reset errors gracefully', async () => {
      vi.mocked(kv.keys).mockRejectedValue(new Error('Reset failed'))

      await expect(resetSSEEventStorageForTests()).rejects.toThrow('Reset failed')
    })
  })
})
