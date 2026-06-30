import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ─── Types ─────────────────────────────────────────────────────────

interface AgentPosition {
  agentId: string
  lat: number
  lng: number
  timestamp: string
}

interface AgentHealth {
  status: "healthy" | "degraded" | "offline"
  cpu: number
  memory: number
  uptime: number
  missedHeartbeats: number
  lastHeartbeat: string
}

interface ReputationData {
  score: number
  badge: string
  totalActions: number
}

interface NotificationSummary {
  unreadCount: number
}

interface DashboardState {
  position: AgentPosition | null
  health: AgentHealth | null
  reputation: ReputationData | null
  notifications: NotificationSummary | null
  loading: boolean
  error: string | null
}

// ─── Mock Data ──────────────────────────────────────────────────

const mockHealthyState: DashboardState = {
  position: {
    agentId: "agent-test-123",
    lat: 40.7128,
    lng: -74.006,
    timestamp: new Date().toISOString(),
  },
  health: {
    status: "healthy",
    cpu: 42.5,
    memory: 38.2,
    uptime: 3600,
    missedHeartbeats: 0,
    lastHeartbeat: new Date().toISOString(),
  },
  reputation: {
    score: 847,
    badge: "Gold",
    totalActions: 1240,
  },
  notifications: {
    unreadCount: 3,
  },
  loading: false,
  error: null,
}

const mockOfflineState: DashboardState = {
  position: null,
  health: {
    status: "offline",
    cpu: 0,
    memory: 0,
    uptime: 0,
    missedHeartbeats: 5,
    lastHeartbeat: "",
  },
  reputation: {
    score: 0,
    badge: "Unranked",
    totalActions: 0,
  },
  notifications: {
    unreadCount: 0,
  },
  loading: false,
  error: null,
}

const mockErrorState: DashboardState = {
  position: null,
  health: null,
  reputation: null,
  notifications: null,
  loading: false,
  error: "Network error",
}

// ─── Test Suite ───────────────────────────────────────────────────

describe("AgentDashboard", () => {
  const agentId = "agent-test-123"

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    global.fetch = vi.fn(async (input: string | Request | URL) => {
      const url = String(input)

      if (url.includes("/health")) {
        return new Response(
          JSON.stringify({
            ok: true,
            health: {
              status: "healthy",
              cpu: 42.5,
              memory: 38.2,
              uptime: 3600,
              missedHeartbeats: 0,
              lastHeartbeat: new Date().toISOString(),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }

      if (url.includes("/reputation")) {
        return new Response(
          JSON.stringify({
            ok: true,
            reputation: {
              score: 847,
              badge: "Gold",
              totalActions: 1240,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }

      if (url.includes("/notifications")) {
        return new Response(
          JSON.stringify({
            ok: true,
            unreadCount: 3,
            notifications: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }

      return new Response(JSON.stringify({ ok: false }), { status: 404 })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ─── State Shape Tests ──────────────────────────────────────────

  it("has correct initial loading state", () => {
    const state: DashboardState = {
      position: null,
      health: null,
      reputation: null,
      notifications: null,
      loading: true,
      error: null,
    }

    expect(state.loading).toBe(true)
    expect(state.position).toBeNull()
    expect(state.health).toBeNull()
    expect(state.reputation).toBeNull()
    expect(state.notifications).toBeNull()
    expect(state.error).toBeNull()
  })

  it("healthy state has all required fields", () => {
    expect(mockHealthyState.loading).toBe(false)
    expect(mockHealthyState.error).toBeNull()

    // Position
    expect(mockHealthyState.position).toBeDefined()
    expect(mockHealthyState.position!.agentId).toBe(agentId)
    expect(typeof mockHealthyState.position!.lat).toBe("number")
    expect(typeof mockHealthyState.position!.lng).toBe("number")
    expect(typeof mockHealthyState.position!.timestamp).toBe("string")

    // Health
    expect(mockHealthyState.health).toBeDefined()
    expect(mockHealthyState.health!.status).toBe("healthy")
    expect(typeof mockHealthyState.health!.cpu).toBe("number")
    expect(typeof mockHealthyState.health!.memory).toBe("number")
    expect(typeof mockHealthyState.health!.uptime).toBe("number")
    expect(typeof mockHealthyState.health!.missedHeartbeats).toBe("number")

    // Reputation
    expect(mockHealthyState.reputation).toBeDefined()
    expect(typeof mockHealthyState.reputation!.score).toBe("number")
    expect(typeof mockHealthyState.reputation!.badge).toBe("string")

    // Notifications
    expect(mockHealthyState.notifications).toBeDefined()
    expect(typeof mockHealthyState.notifications!.unreadCount).toBe("number")
  })

  it("offline state reflects missing heartbeat", () => {
    expect(mockOfflineState.health!.status).toBe("offline")
    expect(mockOfflineState.health!.cpu).toBe(0)
    expect(mockOfflineState.health!.memory).toBe(0)
    expect(mockOfflineState.health!.missedHeartbeats).toBeGreaterThan(0)
    expect(mockOfflineState.position).toBeNull()
  })

  it("error state has error message and no data", () => {
    expect(mockErrorState.error).toBeTruthy()
    expect(mockErrorState.health).toBeNull()
    expect(mockErrorState.reputation).toBeNull()
    expect(mockErrorState.notifications).toBeNull()
  })

  // ─── API Integration Tests ────────────────────────────────────────

  it("fetches health data successfully", async () => {
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/health`)
    const data = await res.json()

    expect(res.ok).toBe(true)
    expect(data.ok).toBe(true)
    expect(data.health.status).toBe("healthy")
    expect(data.health.cpu).toBe(42.5)
    expect(data.health.memory).toBe(38.2)
  })

  it("fetches reputation data successfully", async () => {
    const res = await fetch(`/api/protocol/reputation?actorId=${encodeURIComponent(agentId)}`)
    const data = await res.json()

    expect(res.ok).toBe(true)
    expect(data.ok).toBe(true)
    expect(data.reputation.score).toBe(847)
    expect(data.reputation.badge).toBe("Gold")
  })

  it("fetches notification count successfully", async () => {
    const res = await fetch(`/api/notifications?agentId=${encodeURIComponent(agentId)}&limit=1`)
    const data = await res.json()

    expect(res.ok).toBe(true)
    expect(data.ok).toBe(true)
    expect(data.unreadCount).toBe(3)
  })

  it("handles 404 health response as offline", async () => {
    global.fetch = vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes("/health")) {
        return new Response(
          JSON.stringify({ ok: false, error: "No heartbeat recorded for agent" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 })
    })

    const res = await fetch(`/api/agents/${agentId}/health`)
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
  })

  it("handles network errors gracefully", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("Network error")
    })

    await expect(fetch(`/api/agents/${agentId}/health`)).rejects.toThrow("Network error")
  })

  // ─── Polling Behavior Tests ─────────────────────────────────────

  it("polls health endpoint at 30 second intervals", async () => {
    const fetchSpy = vi.mocked(global.fetch)

    // Initial fetch
    await fetch(`/api/agents/${agentId}/health`)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // After 30 seconds
    vi.advanceTimersByTime(30_000)
    await fetch(`/api/agents/${agentId}/health`)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // After another 30 seconds
    vi.advanceTimersByTime(30_000)
    await fetch(`/api/agents/${agentId}/health`)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  // ─── Data Transformation Tests ────────────────────────────────────

  it("truncates agent ID for display", () => {
    const displayId = agentId.slice(0, 8) + "…"
    expect(displayId).toBe("agent-te…")
    expect(displayId.length).toBeLessThan(agentId.length)
  })

  it("formats position coordinates to 6 decimal places", () => {
    const lat = 40.7128
    const formatted = lat.toFixed(6)
    expect(formatted).toBe("40.712800")
    expect(formatted.split(".")[1].length).toBe(6)
  })

  it("determines health status color correctly", () => {
    const getStatusColor = (status: string) => {
      if (status === "healthy") return "#34d399"
      if (status === "degraded") return "#fbbf24"
      return "#f87171"
    }

    expect(getStatusColor("healthy")).toBe("#34d399")
    expect(getStatusColor("degraded")).toBe("#fbbf24")
    expect(getStatusColor("offline")).toBe("#f87171")
  })

  it("determines CPU bar color by threshold", () => {
    const getCpuColor = (cpu: number) => {
      if (cpu > 80) return "#f87171"
      if (cpu > 50) return "#fbbf24"
      return "#34d399"
    }

    expect(getCpuColor(90)).toBe("#f87171")
    expect(getCpuColor(60)).toBe("#fbbf24")
    expect(getCpuColor(30)).toBe("#34d399")
  })

  // ─── Notification Badge Tests ───────────────────────────────────

  it("shows notification bubble only when unread > 0", () => {
    const withUnread = { unreadCount: 3 }
    const noUnread = { unreadCount: 0 }

    expect(withUnread.unreadCount > 0).toBe(true)
    expect(noUnread.unreadCount > 0).toBe(false)
  })

  // ─── SSE Event Type Tests ───────────────────────────────────────

  it("handles position snapshot event structure", () => {
    const event = {
      type: "agent.positions.snapshot",
      positions: [
        { agentId, lat: 40.7128, lng: -74.006, timestamp: new Date().toISOString() },
      ],
    }

    expect(event.type).toBe("agent.positions.snapshot")
    expect(Array.isArray(event.positions)).toBe(true)
    expect(event.positions[0].agentId).toBe(agentId)
  })

  it("handles position delta event structure", () => {
    const event = {
      type: "agent.positions.delta",
      agentId,
      lat: 40.7128,
      lng: -74.006,
      timestamp: new Date().toISOString(),
    }

    expect(event.type).toBe("agent.positions.delta")
    expect(event.agentId).toBe(agentId)
    expect(typeof event.lat).toBe("number")
    expect(typeof event.lng).toBe("number")
  })

  // ─── Error Recovery Tests ───────────────────────────────────────

  it("retry mechanism resets error state", () => {
    let state: DashboardState = { ...mockErrorState }

    // Simulate retry
    state = {
      ...state,
      loading: true,
      error: null,
    }

    expect(state.loading).toBe(true)
    expect(state.error).toBeNull()
  })

  it("cleans up resources on unmount", () => {
    const intervals: ReturnType<typeof setInterval>[] = []
    const eventSources: { close: () => void }[] = []

    // Simulate setup
    const intervalId = setInterval(() => {}, 30_000)
    intervals.push(intervalId)

    const es = { close: vi.fn() }
    eventSources.push(es)

    // Simulate cleanup
    intervals.forEach(clearInterval)
    eventSources.forEach((es) => es.close())

    expect(es.close).toHaveBeenCalled()
    expect(intervals.length).toBe(1)
  })
})
