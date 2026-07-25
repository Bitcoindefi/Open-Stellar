export type RateLimitWindow = {
  agentId: string
  windowStartMs: number
  requestCount: number
}

export const RATE_LIMIT = { windowMs: 60_000, maxRequests: 100 } as const

interface AgentRateLimitState {
  timestamps: number[]
  rateLimitHits: number
}

const globalState = globalThis as typeof globalThis & {
  __openStellarAgentRateLimitStore__?: Map<string, AgentRateLimitState>
}

const store =
  globalState.__openStellarAgentRateLimitStore__ ?? new Map<string, AgentRateLimitState>()

if (!globalState.__openStellarAgentRateLimitStore__) {
  globalState.__openStellarAgentRateLimitStore__ = store
}

function normalizeAgentId(agentId: string): string {
  const cleanId = agentId.trim()

  if (!cleanId) {
    throw new Error("agentId is required")
  }

  return cleanId
}

function getAgentState(agentId: string): AgentRateLimitState {
  const cleanId = normalizeAgentId(agentId)
  const existing = store.get(cleanId)

  if (existing) {
    return existing
  }

  const created: AgentRateLimitState = {
    timestamps: [],
    rateLimitHits: 0,
  }

  store.set(cleanId, created)
  return created
}

function pruneExpiredRequests(state: AgentRateLimitState, nowMs: number): void {
  const windowStartMs = nowMs - RATE_LIMIT.windowMs

  while (state.timestamps.length > 0 && state.timestamps[0]! < windowStartMs) {
    state.timestamps.shift()
  }
}

export function consumeRateLimit(
  agentId: string,
  nowMs = Date.now(),
): { allowed: boolean; retryAfterMs?: number } {
  const state = getAgentState(agentId)
  pruneExpiredRequests(state, nowMs)

  if (state.timestamps.length >= RATE_LIMIT.maxRequests) {
    state.rateLimitHits += 1
    const oldestRequestMs = state.timestamps[0]!
    const retryAfterMs = Math.max(1, oldestRequestMs + RATE_LIMIT.windowMs - nowMs)

    return { allowed: false, retryAfterMs }
  }

  state.timestamps.push(nowMs)
  return { allowed: true }
}

export function getRateLimitStatus(
  agentId: string,
  nowMs = Date.now(),
): {
  requestsInWindow: number
  limit: number
  windowMs: number
  resetsAt: string
  rateLimitHits: number
} {
  const state = getAgentState(agentId)
  pruneExpiredRequests(state, nowMs)

  const oldestRequestMs = state.timestamps[0]
  const resetsAtMs = oldestRequestMs ? oldestRequestMs + RATE_LIMIT.windowMs : nowMs

  return {
    requestsInWindow: state.timestamps.length,
    limit: RATE_LIMIT.maxRequests,
    windowMs: RATE_LIMIT.windowMs,
    resetsAt: new Date(resetsAtMs).toISOString(),
    rateLimitHits: state.rateLimitHits,
  }
}

export function resetAgentRateLimitStoreForTests(): void {
  store.clear()
}
