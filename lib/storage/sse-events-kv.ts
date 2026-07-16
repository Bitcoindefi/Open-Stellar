import { kv } from '@vercel/kv'
import type { PublishedSystemEvent } from '@/lib/events/system-events'

// KV Key Patterns
const KEYS = {
  // Global event stream (sorted by timestamp)
  GLOBAL_EVENTS: 'sse:events:global',
  
  // Agent-specific event streams
  AGENT_EVENTS: (agentId: string) => `sse:events:agent:${agentId}`,
  
  // Event-type specific streams
  TYPE_EVENTS: (eventType: string) => `sse:events:type:${eventType}`,
  
  // Event lookup by ID
  EVENT_BY_ID: (eventId: string) => `sse:event:${eventId}`,
  
  // Metadata
  LATEST_EVENT_ID: 'sse:events:latest_id',
  EVENT_COUNT: 'sse:events:count',
}

// TTL Configuration (24 hours for event streams)
const EVENT_STREAM_TTL = 24 * 60 * 60 // 24 hours in seconds
const EVENT_DETAIL_TTL = 7 * 24 * 60 * 60 // 7 days for individual event details

/**
 * Initialize SSE event storage in KV
 */
export async function initializeSSEEventStorage(): Promise<void> {
  try {
    // Set initial counters if they don't exist
    await kv.setnx(KEYS.LATEST_EVENT_ID, '0')
    await kv.setnx(KEYS.EVENT_COUNT, '0')
  } catch (error) {
    console.error('Failed to initialize SSE event storage:', error)
    throw error
  }
}

/**
 * Save a system event to KV storage
 * Stores the event in multiple places for efficient querying:
 * 1. Global stream (for all events)
 * 2. Agent-specific stream (if agent-scoped)
 * 3. Event-type stream (for type-based queries)
 * 4. Individual event lookup (by ID)
 */
export async function saveSSEEvent(event: PublishedSystemEvent): Promise<void> {
  try {
    const eventJson = JSON.stringify(event)
    const timestamp = Date.now()
    const score = timestamp
    
    // Store individual event by ID
    await kv.set(KEYS.EVENT_BY_ID(event.id), eventJson, { ex: EVENT_DETAIL_TTL })
    
    // Add to global event stream (sorted set by timestamp)
    await kv.zadd(KEYS.GLOBAL_EVENTS, { score, member: event.id })
    await kv.expire(KEYS.GLOBAL_EVENTS, EVENT_STREAM_TTL)
    
    // Add to agent-specific stream if agent-scoped
    if (event.agentId) {
      await kv.zadd(KEYS.AGENT_EVENTS(event.agentId), { score, member: event.id })
      await kv.expire(KEYS.AGENT_EVENTS(event.agentId), EVENT_STREAM_TTL)
    }
    
    // Add to event-type stream
    await kv.zadd(KEYS.TYPE_EVENTS(event.type), { score, member: event.id })
    await kv.expire(KEYS.TYPE_EVENTS(event.type), EVENT_STREAM_TTL)
    
    // Update counters
    await kv.incr(KEYS.EVENT_COUNT)
    await kv.set(KEYS.LATEST_EVENT_ID, event.id)
  } catch (error) {
    console.error('Failed to save SSE event:', error)
    throw error
  }
}

/**
 * Get a specific event by ID
 */
export async function getSSEEvent(eventId: string): Promise<PublishedSystemEvent | null> {
  try {
    const eventJson = await kv.get<string>(KEYS.EVENT_BY_ID(eventId))
    if (!eventJson) {
      return null
    }
    return JSON.parse(eventJson) as PublishedSystemEvent
  } catch (error) {
    console.error('Failed to get SSE event:', error)
    throw error
  }
}

/**
 * Get recent events from the global stream
 */
export async function getRecentGlobalEvents(limit: number = 100): Promise<PublishedSystemEvent[]> {
  try {
    // Get event IDs from the sorted set (most recent first)
    const eventIds = await kv.zrevrange(KEYS.GLOBAL_EVENTS, 0, limit - 1)
    
    if (eventIds.length === 0) {
      return []
    }
    
    // Fetch all events in parallel
    const events = await Promise.all(
      eventIds.map((id) => getSSEEvent(id as string))
    )
    
    return events.filter((e): e is PublishedSystemEvent => e !== null)
  } catch (error) {
    console.error('Failed to get recent global events:', error)
    throw error
  }
}

/**
 * Get recent events for a specific agent
 */
export async function getRecentAgentEvents(agentId: string, limit: number = 100): Promise<PublishedSystemEvent[]> {
  try {
    const eventIds = await kv.zrevrange(KEYS.AGENT_EVENTS(agentId), 0, limit - 1)
    
    if (eventIds.length === 0) {
      return []
    }
    
    const events = await Promise.all(
      eventIds.map((id) => getSSEEvent(id as string))
    )
    
    return events.filter((e): e is PublishedSystemEvent => e !== null)
  } catch (error) {
    console.error('Failed to get recent agent events:', error)
    throw error
  }
}

/**
 * Get recent events of a specific type
 */
export async function getRecentEventsByType(eventType: string, limit: number = 100): Promise<PublishedSystemEvent[]> {
  try {
    const eventIds = await kv.zrevrange(KEYS.TYPE_EVENTS(eventType), 0, limit - 1)
    
    if (eventIds.length === 0) {
      return []
    }
    
    const events = await Promise.all(
      eventIds.map((id) => getSSEEvent(id as string))
    )
    
    return events.filter((e): e is PublishedSystemEvent => e !== null)
  } catch (error) {
    console.error('Failed to get recent events by type:', error)
    throw error
  }
}

/**
 * Get events within a time range
 */
export async function getEventsInRange(
  startTime: number,
  endTime: number,
  limit: number = 100
): Promise<PublishedSystemEvent[]> {
  try {
    const eventIds = await kv.zrangebyscore(KEYS.GLOBAL_EVENTS, startTime, endTime, {
      rev: true,
      count: limit,
    })
    
    if (eventIds.length === 0) {
      return []
    }
    
    const events = await Promise.all(
      eventIds.map((id) => getSSEEvent(id as string))
    )
    
    return events.filter((e): e is PublishedSystemEvent => e !== null)
  } catch (error) {
    console.error('Failed to get events in range:', error)
    throw error
  }
}

/**
 * Get event statistics
 */
export async function getSSEEventStats(): Promise<{
  totalEvents: number
  latestEventId: string
  streamSizes: {
    global: number
    byAgent: number
    byType: number
  }
}> {
  try {
    const totalEvents = parseInt((await kv.get(KEYS.EVENT_COUNT)) || '0', 10)
    const latestEventId = (await kv.get(KEYS.LATEST_EVENT_ID)) || ''
    
    const globalSize = await kv.zcard(KEYS.GLOBAL_EVENTS)
    
    // Count agent-specific streams (pattern matching)
    const agentKeys = await kv.keys('sse:events:agent:*')
    const byAgent = agentKeys.length
    
    // Count type-specific streams
    const typeKeys = await kv.keys('sse:events:type:*')
    const byType = typeKeys.length
    
    return {
      totalEvents,
      latestEventId,
      streamSizes: {
        global,
        byAgent,
        byType,
      },
    }
  } catch (error) {
    console.error('Failed to get SSE event stats:', error)
    throw error
  }
}

/**
 * Clean up old events (can be called by a cron job)
 */
export async function cleanupOldEvents(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  try {
    const cutoffTime = Date.now() - olderThanMs
    const removedCount = await kv.zremrangebyscore(KEYS.GLOBAL_EVENTS, 0, cutoffTime)
    
    // Also clean up individual event details that are older than TTL
    // This is handled automatically by KV's TTL mechanism
    
    return removedCount
  } catch (error) {
    console.error('Failed to cleanup old events:', error)
    throw error
  }
}

/**
 * Reset SSE event storage (for testing only)
 */
export async function resetSSEEventStorageForTests(): Promise<void> {
  try {
    // Delete all SSE-related keys
    const keys = await kv.keys('sse:*')
    if (keys.length > 0) {
      await kv.del(...keys)
    }
    
    // Reinitialize
    await initializeSSEEventStorage()
  } catch (error) {
    console.error('Failed to reset SSE event storage:', error)
    throw error
  }
}
