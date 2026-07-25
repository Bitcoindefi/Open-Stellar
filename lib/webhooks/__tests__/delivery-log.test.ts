import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  appendWebhookDeliveryAttempt,
  getWebhookDeliveryStats,
  listWebhookDeliveries,
  resetWebhookDeliveryLogForTests,
  setWebhookDeliveryLogPathForTests,
  resetWebhookDeliveryLogPathForTests,
} from "../delivery-log"

let testDir: string

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "webhook-test-"))
  setWebhookDeliveryLogPathForTests(join(testDir, "delivery-log.jsonl"))
})

afterEach(() => {
  resetWebhookDeliveryLogForTests()
  resetWebhookDeliveryLogPathForTests()
  rmSync(testDir, { recursive: true, force: true })
})

describe("getWebhookDeliveryStats", () => {
  it("returns zeroed stats for unknown webhook", () => {
    const stats = getWebhookDeliveryStats("wh_unknown")
    expect(stats).toEqual({
      webhookId: "wh_unknown",
      totalDeliveries: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      lastDeliveryAt: null,
      lastSuccessAt: null,
      avgLatencyMs: 0,
    })
  })

  it("computes correct stats for mixed deliveries", () => {
    const webhookId = "wh_test123"

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "agent.status",
      deliveredAt: "2024-01-15T10:00:00.000Z",
      durationMs: 100,
      responseStatus: 200,
      ok: true,
      retried: false,
      attempt: 1,
      status: "success",
    })

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "agent.status",
      deliveredAt: "2024-01-15T10:05:00.000Z",
      durationMs: 5000,
      responseStatus: null,
      ok: false,
      retried: false,
      attempt: 1,
      status: "failed",
    })

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "agent.status",
      deliveredAt: "2024-01-15T10:10:00.000Z",
      durationMs: 200,
      responseStatus: 200,
      ok: true,
      retried: false,
      attempt: 1,
      status: "success",
    })

    const stats = getWebhookDeliveryStats(webhookId)

    expect(stats.totalDeliveries).toBe(3)
    expect(stats.successCount).toBe(2)
    expect(stats.failureCount).toBe(1)
    expect(stats.successRate).toBe(0.667)
    expect(stats.lastDeliveryAt).toBe("2024-01-15T10:10:00.000Z")
    expect(stats.lastSuccessAt).toBe("2024-01-15T10:10:00.000Z")
    expect(stats.avgLatencyMs).toBe(1767) // (100 + 5000 + 200) / 3 = 1766.67 → 1767
  })

  it("ignores deliveries for other webhooks", () => {
    appendWebhookDeliveryAttempt({
      webhookId: "wh_other",
      event: "agent.status",
      deliveredAt: "2024-01-15T10:00:00.000Z",
      durationMs: 100,
      responseStatus: 200,
      ok: true,
      retried: false,
      attempt: 1,
      status: "success",
    })

    const stats = getWebhookDeliveryStats("wh_target")
    expect(stats.totalDeliveries).toBe(0)
  })

  it("computes correct lastSuccessAt when most recent is a failure", () => {
    const webhookId = "wh_last_fail"

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "a",
      deliveredAt: "2024-01-15T10:00:00.000Z",
      durationMs: 100,
      responseStatus: 200,
      ok: true,
      retried: false,
      attempt: 1,
      status: "success",
    })

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "b",
      deliveredAt: "2024-01-15T10:05:00.000Z",
      durationMs: 5000,
      responseStatus: null,
      ok: false,
      retried: false,
      attempt: 1,
      status: "failed",
    })

    const stats = getWebhookDeliveryStats(webhookId)
    expect(stats.lastDeliveryAt).toBe("2024-01-15T10:05:00.000Z")
    expect(stats.lastSuccessAt).toBe("2024-01-15T10:00:00.000Z")
  })
})

describe("listWebhookDeliveries", () => {
  it("returns newest first by default", () => {
    const webhookId = "wh_order"

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "a",
      deliveredAt: "2024-01-15T09:00:00.000Z",
      durationMs: 100,
      responseStatus: 200,
      ok: true,
      retried: false,
      attempt: 1,
      status: "success",
    })

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "b",
      deliveredAt: "2024-01-15T10:00:00.000Z",
      durationMs: 200,
      responseStatus: 200,
      ok: true,
      retried: false,
      attempt: 1,
      status: "success",
    })

    const deliveries = listWebhookDeliveries(webhookId)
    expect(deliveries[0].timestamp).toBe("2024-01-15T10:00:00.000Z")
    expect(deliveries[1].timestamp).toBe("2024-01-15T09:00:00.000Z")
  })

  it("filters by status=success", () => {
    const webhookId = "wh_filter"

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "a",
      deliveredAt: "2024-01-15T10:00:00.000Z",
      durationMs: 100,
      responseStatus: 200,
      ok: true,
      retried: false,
      attempt: 1,
      status: "success",
    })

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "b",
      deliveredAt: "2024-01-15T10:05:00.000Z",
      durationMs: 5000,
      responseStatus: null,
      ok: false,
      retried: false,
      attempt: 1,
      status: "failed",
    })

    const successOnly = listWebhookDeliveries(webhookId, { status: "success" })
    expect(successOnly).toHaveLength(1)
    expect(successOnly[0].status).toBe("success")

    const failureOnly = listWebhookDeliveries(webhookId, { status: "failure" })
    expect(failureOnly).toHaveLength(1)
    expect(failureOnly[0].status).toBe("failure")
  })

  it("caps limit at 100", () => {
    const webhookId = "wh_limit"

    for (let i = 0; i < 150; i++) {
      appendWebhookDeliveryAttempt({
        webhookId,
        event: "a",
        deliveredAt: new Date(2024, 0, 15, 10, i).toISOString(),
        durationMs: 100,
        responseStatus: 200,
        ok: true,
        retried: false,
        attempt: 1,
        status: "success",
      })
    }

    const deliveries = listWebhookDeliveries(webhookId, { limit: 200 })
    expect(deliveries).toHaveLength(100)
  })

  it("defaults limit to 20", () => {
    const webhookId = "wh_default"

    for (let i = 0; i < 30; i++) {
      appendWebhookDeliveryAttempt({
        webhookId,
        event: "a",
        deliveredAt: new Date(2024, 0, 15, 10, i).toISOString(),
        durationMs: 100,
        responseStatus: 200,
        ok: true,
        retried: false,
        attempt: 1,
        status: "success",
      })
    }

    const deliveries = listWebhookDeliveries(webhookId)
    expect(deliveries).toHaveLength(20)
  })

  it("maps error correctly for timeout vs HTTP status", () => {
    const webhookId = "wh_errors"

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "a",
      deliveredAt: "2024-01-15T10:00:00.000Z",
      durationMs: 5000,
      responseStatus: null,
      ok: false,
      retried: false,
      attempt: 1,
      status: "failed",
    })

    appendWebhookDeliveryAttempt({
      webhookId,
      event: "b",
      deliveredAt: "2024-01-15T10:05:00.000Z",
      durationMs: 200,
      responseStatus: 503,
      ok: false,
      retried: false,
      attempt: 1,
      status: "failed",
    })

    const deliveries = listWebhookDeliveries(webhookId, { status: "failure" })
    expect(deliveries[0].error).toBe("HTTP 503")
    expect(deliveries[1].error).toBe("timeout")
  })

  it("returns empty array for webhook with no attempts", () => {
    const deliveries = listWebhookDeliveries("wh_empty")
    expect(deliveries).toEqual([])
  })
})