export type HighPriorityRateLimitState = {
  agentId: string
  windowStartMs: number | null
  usedInWindow: number
  highPriorityPerMinute: number
}

const globalState = globalThis as typeof globalThis & {
  __openStellarHighPriorityRateLimitStore__?: Map<string, HighPriorityRateLimitState>
}

const store: Map<string, HighPriorityRateLimitState> =
  globalState.__openStellarHighPriorityRateLimitStore__ ?? new Map<string, HighPriorityRateLimitState>()

if (!globalState.__openStellarHighPriorityRateLimitStore__) {
  globalState.__openStellarHighPriorityRateLimitStore__ = store
}

const DEFAULT_HIGH_PRIORITY_PER_MINUTE = 5
const WINDOW_MS = 60_000

function normalizeAgentId(agentId: string): string {
  const cleanId = agentId.trim()
  if (!cleanId) throw new Error("agentId is required")
  return cleanId.slice(0, 200)
}

function getOrCreateState(agentId: string): HighPriorityRateLimitState {
  const cleanId = normalizeAgentId(agentId)
  const existing = store.get(cleanId)
  if (existing) return existing

  const created: HighPriorityRateLimitState = {
    agentId: cleanId,
    windowStartMs: null,
    usedInWindow: 0,
    highPriorityPerMinute: DEFAULT_HIGH_PRIORITY_PER_MINUTE,
  }

  store.set(cleanId, created)
  return created
}

export function resetHighPriorityRateLimitStoreForTests(): void {
  store.clear()
}

export function setHighPriorityPerMinute(agentId: string, highPriorityPerMinute: number): void {
  if (!Number.isFinite(highPriorityPerMinute)) throw new Error("highPriorityPerMinute must be a number")
  if (highPriorityPerMinute < 0) throw new Error("highPriorityPerMinute must be >= 0")

  const state = getOrCreateState(agentId)
  state.highPriorityPerMinute = Math.floor(highPriorityPerMinute)
}

export function getHighPriorityRateLimitStatus(agentId: string, nowMs = Date.now()): {
  agentId: string
  limit: number
  usage: number
  windowMs: number
  resetsAt: string
} {
  const state = getOrCreateState(agentId)

  if (state.windowStartMs === null) {
    // Not started yet; set resetsAt to end of first window.
    const start = nowMs
    return {
      agentId: state.agentId,
      limit: state.highPriorityPerMinute,
      usage: 0,
      windowMs: WINDOW_MS,
      resetsAt: new Date(start + WINDOW_MS).toISOString(),
    }
  }

  const resetsAtMs = state.windowStartMs + WINDOW_MS
  return {
    agentId: state.agentId,
    limit: state.highPriorityPerMinute,
    usage: state.usedInWindow,
    windowMs: WINDOW_MS,
    resetsAt: new Date(resetsAtMs).toISOString(),
  }
}

export function consumeHighPrioritySlotOrDowngrade(agentId: string, nowMs = Date.now()): {
  priorityAllowed: boolean
  usedInWindow: number
  limit: number
  resetsAt: string
} {
  const state = getOrCreateState(agentId)

  if (state.windowStartMs === null || nowMs - state.windowStartMs >= WINDOW_MS) {
    // non-sliding-window reset: hard reset when window expires.
    state.windowStartMs = nowMs
    state.usedInWindow = 0
  }

  const limit = state.highPriorityPerMinute
  const allowed = state.usedInWindow < limit

  // Always increment usage when a high-priority enqueue arrives.
  state.usedInWindow += 1

  const resetsAtMs = state.windowStartMs + WINDOW_MS

  return {
    priorityAllowed: allowed,
    usedInWindow: state.usedInWindow,
    limit,
    resetsAt: new Date(resetsAtMs).toISOString(),
  }
}

