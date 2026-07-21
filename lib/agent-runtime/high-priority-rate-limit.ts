export interface AgentHighPriorityRateLimitState {
  limit: number
  count: number
  windowStartMs: number
}

export const DEFAULT_HIGH_PRIORITY_PER_MINUTE = 5
export const RATE_LIMIT_WINDOW_MS = 60_000

interface GlobalState {
  __openStellarHighPriorityRateLimitStore__?: Map<string, AgentHighPriorityRateLimitState>
}

const globalStore = globalThis as typeof globalThis & GlobalState

const store =
  globalStore.__openStellarHighPriorityRateLimitStore__ ??
  new Map<string, AgentHighPriorityRateLimitState>()

if (!globalStore.__openStellarHighPriorityRateLimitStore__) {
  globalStore.__openStellarHighPriorityRateLimitStore__ = store
}

function normalizeAgentId(agentId: string): string {
  const cleanId = agentId.trim()
  if (!cleanId) {
    throw new Error("agentId is required")
  }
  return cleanId
}

export function getAgentHighPriorityState(
  agentId: string,
  nowMs = Date.now(),
): AgentHighPriorityRateLimitState {
  const cleanId = normalizeAgentId(agentId)
  let state = store.get(cleanId)

  if (!state) {
    state = {
      limit: DEFAULT_HIGH_PRIORITY_PER_MINUTE,
      count: 0,
      windowStartMs: nowMs,
    }
    store.set(cleanId, state)
  }

  if (nowMs - state.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    state.count = 0
    state.windowStartMs = nowMs
  }

  return state
}

export function setAgentHighPriorityLimit(
  agentId: string,
  limit: number,
  nowMs = Date.now(),
): AgentHighPriorityRateLimitState {
  const cleanId = normalizeAgentId(agentId)

  if (typeof limit !== "number" || Number.isNaN(limit) || limit < 0) {
    throw new Error("highPriorityPerMinute must be a non-negative number")
  }

  const state = getAgentHighPriorityState(cleanId, nowMs)
  state.limit = Math.floor(limit)
  return state
}

export function checkAndConsumeHighPrioritySlot(
  agentId: string,
  nowMs = Date.now(),
): { priority: "high" | "medium"; downgraded: boolean; limit: number; usage: number } {
  const state = getAgentHighPriorityState(agentId, nowMs)

  if (state.count < state.limit) {
    state.count += 1
    return {
      priority: "high",
      downgraded: false,
      limit: state.limit,
      usage: state.count,
    }
  }

  state.count += 1
  console.warn(
    `[TaskQueue] High-priority rate limit exceeded for agent ${agentId} (${state.limit}/min). Task downgraded to medium.`,
  )

  return {
    priority: "medium",
    downgraded: true,
    limit: state.limit,
    usage: state.count,
  }
}

export function getAgentHighPriorityStatus(
  agentId: string,
  nowMs = Date.now(),
): {
  agentId: string
  limit: number
  highPriorityPerMinute: number
  usage: number
  currentUsage: number
  windowMs: number
  resetsInSeconds: number
} {
  const cleanId = normalizeAgentId(agentId)
  const state = getAgentHighPriorityState(cleanId, nowMs)
  const elapsedMs = nowMs - state.windowStartMs
  const remainingMs = Math.max(0, RATE_LIMIT_WINDOW_MS - elapsedMs)

  return {
    agentId: cleanId,
    limit: state.limit,
    highPriorityPerMinute: state.limit,
    usage: state.count,
    currentUsage: state.count,
    windowMs: RATE_LIMIT_WINDOW_MS,
    resetsInSeconds: Math.ceil(remainingMs / 1000),
  }
}

export function resetHighPriorityRateLimitStoreForTests(): void {
  store.clear()
}
