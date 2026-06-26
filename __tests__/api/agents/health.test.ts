import { afterEach, describe, expect, it } from "vitest"
import { GET as getHealth } from "@/app/api/agents/[id]/health/route"
import { POST as postHeartbeat } from "@/app/api/agents/[id]/heartbeat/route"
import { GET as getUptime } from "@/app/api/agents/[id]/uptime/route"
import { GET as runCronHealthCheck } from "@/app/api/cron/health-check/route"
import {
  ALERT_AFTER_MS,
  OFFLINE_AFTER_MS,
  getAgentHealth,
  recordAgentHeartbeat,
  resetAgentHealthStore,
  runAgentHealthCheck,
} from "@/lib/agents/agent-health-store"
import { getAgentUptime, resetAgentUptimeStore } from "@/lib/agents/agent-uptime-store"
import { listUnseenNotifications, resetNotificationStore } from "@/lib/notifications/notification-store"

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

afterEach(() => {
  resetAgentHealthStore()
  resetAgentUptimeStore()
  resetNotificationStore()
})

describe("agent heartbeat and health routes", () => {
  it("records heartbeat telemetry and returns healthy status", async () => {
    const req = new Request("http://localhost/api/agents/bot-route/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "working",
        cpu: 43.2,
        memory: 62.8,
        currentTask: "Indexing logs",
        autoRestart: true,
      }),
    })

    const res = await postHeartbeat(req, context("bot-route"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.health.agentId).toBe("bot-route")
    expect(data.health.status).toBe("healthy")
    expect(data.health.runtimeStatus).toBe("working")
    expect(data.health.cpu).toBe(43)
    expect(data.health.memory).toBe(63)
    expect(data.health.autoRestart).toBe(true)

    const healthRes = await getHealth(new Request("http://localhost/api/agents/bot-route/health"), context("bot-route"))
    const healthData = await healthRes.json()

    expect(healthRes.status).toBe(200)
    expect(healthData.health.currentTask).toBe("Indexing logs")
    expect(getAgentUptime("bot-route")?.uptimeDays).toBe(1)
  })

  it("returns an agent from offline back to active once heartbeats resume", async () => {
    const base = Date.parse("2026-06-24T08:00:00.000Z")
    recordAgentHeartbeat("bot-recover", {
      status: "active",
      autoRestart: true,
      nowMs: base,
    })
    runAgentHealthCheck(base + 45_001)

    const req = new Request("http://localhost/api/agents/bot-recover/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "working", cpu: 51, memory: 47, currentTask: "Recovering" }),
    })
    const res = await postHeartbeat(req, context("bot-recover"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.health.runtimeStatus).toBe("working")
    expect(data.health.status).toBe("healthy")

    const health = getAgentHealth("bot-recover")
    expect(health?.runtimeStatus).toBe("working")
    expect(health?.status).toBe("healthy")
  })

  it("returns 404 when an agent has not sent a heartbeat yet", async () => {
    const res = await getHealth(new Request("http://localhost/api/agents/missing/health"), context("missing"))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
    expect(data.agentId).toBe("missing")
  })

  it("returns current uptime for an agent with heartbeat history", async () => {
    const nowMs = Date.now()
    const firstSeenMs = nowMs - 24 * 60 * 60 * 1000

    recordAgentHeartbeat("bot-uptime-route", {
      status: "active",
      nowMs: firstSeenMs,
    })
    recordAgentHeartbeat("bot-uptime-route", {
      status: "active",
      nowMs,
    })

    const res = await getUptime(new Request("http://localhost/api/agents/bot-uptime-route/uptime"), context("bot-uptime-route"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({
      agentId: "bot-uptime-route",
      uptimeDays: 2,
      firstSeenAt: new Date(firstSeenMs).toISOString(),
      lastSeenAt: new Date(nowMs).toISOString(),
    })
  })
})

describe("agent health check", () => {
  it("marks stale agents offline and records an auto-restart request", () => {
    const base = Date.parse("2026-06-24T08:00:00.000Z")
    recordAgentHeartbeat("bot-stale", {
      status: "active",
      cpu: 25,
      memory: 30,
      currentTask: "Monitoring",
      autoRestart: true,
      nowMs: base,
    })

    const result = runAgentHealthCheck(base + OFFLINE_AFTER_MS + 1)
    const health = getAgentHealth("bot-stale", base + OFFLINE_AFTER_MS + 1)

    expect(result.checkedAgents).toBe(1)
    expect(result.offlineAgents).toHaveLength(1)
    expect(result.restartedAgents).toHaveLength(1)
    expect(result.events.map((event) => event.type)).toEqual(["agent.status", "agent.restart"])
    expect(health?.status).toBe("offline")
    expect(health?.runtimeStatus).toBe("offline")
    expect(health?.restartAttempts).toBe(1)
    expect(health?.missedHeartbeats).toBeGreaterThanOrEqual(2)
  })

  it("generates an offline notification when an agent misses the heartbeat threshold", () => {
    const base = Date.parse("2026-06-24T08:00:00.000Z")
    recordAgentHeartbeat("bot-notify-offline", {
      status: "active",
      nowMs: base,
    })

    runAgentHealthCheck(base + OFFLINE_AFTER_MS + 1)

    expect(listUnseenNotifications("bot-notify-offline")).toMatchObject([
      {
        agentId: "bot-notify-offline",
        type: "agent_offline",
        resourceHref: "/agents/bot-notify-offline",
      },
    ])
  })

  it("raises an error-severity alert after five minutes offline", () => {
    const base = Date.parse("2026-06-24T08:00:00.000Z")
    recordAgentHeartbeat("bot-alert", {
      status: "active",
      autoRestart: false,
      nowMs: base,
    })

    const result = runAgentHealthCheck(base + OFFLINE_AFTER_MS + ALERT_AFTER_MS + 1)

    expect(result.alerts).toHaveLength(1)
    expect(result.alerts[0].agentId).toBe("bot-alert")
    expect(result.alerts[0].alertSeverity).toBe("error")
  })

  it("exposes cron-compatible health check output", async () => {
    recordAgentHeartbeat("bot-cron", { status: "idle", cpu: 11, memory: 22 })

    const res = await runCronHealthCheck(new Request("http://localhost/api/cron/health-check"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.checkedAgents).toBe(1)
    expect(data.agents[0].agentId).toBe("bot-cron")
  })
})
