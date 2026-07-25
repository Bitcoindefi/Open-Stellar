import { afterEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/agents/uptime/summary/route"
import { OFFLINE_AFTER_MS, recordAgentHeartbeat, resetAgentHealthStore } from "@/lib/agents/agent-health-store"
import { resetAgentUptimeStore } from "@/lib/agents/agent-uptime-store"

const CHECKED_AT = "2026-06-26T16:00:00.000Z"
const CHECKED_AT_MS = Date.parse(CHECKED_AT)

afterEach(() => {
  vi.useRealTimers()
  resetAgentHealthStore()
  resetAgentUptimeStore()
})

async function getSummary() {
  const res = await GET(new Request("http://localhost/api/agents/uptime/summary"))
  return { res, data: await res.json() }
}

describe("agent uptime summary route", () => {
  it("returns a stable empty summary when no agents exist", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(CHECKED_AT))

    const { res, data } = await getSummary()

    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(data).toEqual({
      totalAgents: 0,
      online: 0,
      offline: 0,
      averageUptimePct: 100,
      p50UptimePct: 100,
      p95UptimePct: 100,
      checkedAt: CHECKED_AT,
    })
  })

  it("summarizes mixed online and offline agents with all required fields", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(CHECKED_AT))

    recordAgentHeartbeat("online-agent", { status: "active", nowMs: CHECKED_AT_MS })
    recordAgentHeartbeat("offline-agent", {
      status: "active",
      nowMs: CHECKED_AT_MS - OFFLINE_AFTER_MS - 1,
    })

    const { res, data } = await getSummary()

    expect(res.status).toBe(200)
    expect(data.totalAgents).toBe(2)
    expect(data.online).toBe(1)
    expect(data.offline).toBe(1)
    expect(data.online + data.offline).toBe(data.totalAgents)
    expect(data.averageUptimePct).toBeGreaterThanOrEqual(0)
    expect(data.averageUptimePct).toBeLessThanOrEqual(100)
    expect(Object.keys(data).sort()).toEqual([
      "averageUptimePct",
      "checkedAt",
      "offline",
      "online",
      "p50UptimePct",
      "p95UptimePct",
      "totalAgents",
    ])
  })

  it("calculates average and percentile uptime percentages across the fleet", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(CHECKED_AT))

    recordAgentHeartbeat("agent-fresh", { status: "active", nowMs: CHECKED_AT_MS })
    recordAgentHeartbeat("agent-expired-a", {
      status: "active",
      nowMs: CHECKED_AT_MS - 2 * 24 * 60 * 60 * 1000,
    })
    recordAgentHeartbeat("agent-expired-b", {
      status: "active",
      nowMs: CHECKED_AT_MS - 3 * 24 * 60 * 60 * 1000,
    })

    const { data } = await getSummary()

    expect(data.totalAgents).toBe(3)
    expect(data.averageUptimePct).toBe(33.3)
    expect(data.p50UptimePct).toBe(0)
    expect(data.p95UptimePct).toBe(100)
  })
})
