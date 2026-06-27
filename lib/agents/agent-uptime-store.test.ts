import { afterEach, describe, expect, it } from "vitest"

import {
  getAgentUptime,
  listAgentUptimes,
  recordAgentUptimeHeartbeat,
  resetAgentUptimeStore,
} from "@/lib/agents/agent-uptime-store"

afterEach(() => {
  resetAgentUptimeStore()
})

describe("agent uptime store", () => {
  it("counts one uptime day for each UTC calendar day with a healthy heartbeat", () => {
    const lastSeenMs = Date.parse("2026-06-26T22:45:00.000Z")

    recordAgentUptimeHeartbeat("uptime-daily", Date.parse("2026-06-24T23:30:00.000Z"))
    recordAgentUptimeHeartbeat("uptime-daily", Date.parse("2026-06-25T23:15:00.000Z"))
    recordAgentUptimeHeartbeat("uptime-daily", lastSeenMs)

    expect(getAgentUptime("uptime-daily", lastSeenMs)).toMatchObject({
      agentId: "uptime-daily",
      firstSeenAt: "2026-06-24T23:30:00.000Z",
      lastSeenAt: "2026-06-26T22:45:00.000Z",
      uptimeDays: 3,
    })
  })

  it("does not increment more than once for multiple heartbeats on the same UTC day", () => {
    const lastSeenMs = Date.parse("2026-06-24T18:00:00.000Z")

    recordAgentUptimeHeartbeat("uptime-same-day", Date.parse("2026-06-24T08:00:00.000Z"))
    recordAgentUptimeHeartbeat("uptime-same-day", lastSeenMs)

    expect(getAgentUptime("uptime-same-day", lastSeenMs)?.uptimeDays).toBe(1)
  })

  it("returns zero uptime days after more than 24 hours without a heartbeat", () => {
    const base = Date.parse("2026-06-24T08:00:00.000Z")

    recordAgentUptimeHeartbeat("uptime-gap", base)
    recordAgentUptimeHeartbeat("uptime-gap", base + 24 * 60 * 60 * 1000)
    recordAgentUptimeHeartbeat("uptime-gap", base + 2 * 24 * 60 * 60 * 1000)

    expect(getAgentUptime("uptime-gap", base + 2 * 24 * 60 * 60 * 1000)?.uptimeDays).toBe(3)
    expect(getAgentUptime("uptime-gap", base + 2 * 24 * 60 * 60 * 1000 + 25 * 60 * 60 * 1000)?.uptimeDays).toBe(0)
  })

  it("lists current uptime snapshots sorted by agent id", () => {
    const nowMs = Date.parse("2026-06-26T16:00:00.000Z")

    recordAgentUptimeHeartbeat("uptime-z", nowMs)
    recordAgentUptimeHeartbeat("uptime-a", nowMs)

    expect(listAgentUptimes(nowMs).map((uptime) => uptime.agentId)).toEqual(["uptime-a", "uptime-z"])
  })
})
