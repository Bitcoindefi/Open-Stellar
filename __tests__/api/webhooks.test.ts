import { createHmac } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as EVENT_TYPES_GET } from "@/app/api/webhooks/event-types/route"
import { DELETE } from "@/app/api/webhooks/[id]/route"
import { GET as DELIVERIES_GET } from "@/app/api/webhooks/[id]/deliveries/route"
import { POST as ROTATE_POST } from "@/app/api/webhooks/[id]/rotate/route"
import { GET, POST } from "@/app/api/webhooks/route"
import { publishSystemEvent } from "@/lib/events/system-events"
import { deliverWebhookEvent } from "@/lib/webhooks/delivery"
import {
  resetWebhookRetryCancellationForTests,
  resetWebhookRetryDelayForTests,
  setWebhookRetryDelayForTests,
  setWebhookRetryDelaysForTests,
} from "@/lib/webhooks/delivery"
import {
  appendWebhookDeliveryAttempt,
  listWebhookDeliveryAttempts,
  resetWebhookDeliveryLogForTests,
  resetWebhookDeliveryLogPathForTests,
  setWebhookDeliveryLogPathForTests,
} from "@/lib/webhooks/delivery-log"
import {
  enqueueWebhookRetry,
  listWebhookRetryEntries,
  resetWebhookRetryStorePathForTests,
  setWebhookRetryStorePathForTests,
} from "@/lib/webhooks/retry-store"
import {
  resetWebhookStoreForTests,
  resetWebhookStorePathForTests,
  setWebhookStorePathForTests,
} from "@/lib/webhooks/store"

function webhookRequest(body: unknown): Request {
  return new Request("http://localhost/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function registerWebhook(url = "https://partner.example/webhooks/open-stellar") {
  const res = await POST(webhookRequest({ url, events: ["agent.status", "quest.completed"] }))
  return {
    res,
    data: await res.json() as { id: string; secret: string },
  }
}

describe("webhook API", () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "open-stellar-webhooks-"))
    setWebhookStorePathForTests(join(testDir, "webhooks.json"))
    setWebhookDeliveryLogPathForTests(join(testDir, "webhook-delivery-log.jsonl"))
    setWebhookRetryStorePathForTests(join(testDir, "webhook-retry-queue.json"))
    resetWebhookStoreForTests()
    resetWebhookDeliveryLogForTests()
    setWebhookRetryDelayForTests(0)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetWebhookRetryCancellationForTests()
    vi.useRealTimers()
    resetWebhookRetryDelayForTests()
    resetWebhookStorePathForTests()
    resetWebhookDeliveryLogPathForTests()
    resetWebhookRetryStorePathForTests()
    rmSync(testDir, { recursive: true, force: true })
  })

  it("registers a webhook with a valid URL and returns its id and secret", async () => {
    const { res, data } = await registerWebhook()

    expect(res.status).toBe(201)
    expect(data.id).toMatch(/^wh_/)
    expect(data.secret).toHaveLength(64)
  })

  it("rejects invalid webhook URLs", async () => {
    const res = await POST(webhookRequest({ url: "not a url", events: ["agent.status"] }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe("Invalid webhook URL")
  })

  it("rejects unknown event types", async () => {
    const res = await POST(webhookRequest({ url: "https://example.com/hook", events: ["agent.status", "nonsense.event"] }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/nonsense\.event/)
  })

  it("returns the list of supported event types", async () => {
    const res = await EVENT_TYPES_GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.eventTypes).toContain("agent.status")
    expect(data.eventTypes).toContain("quest.completed")
    expect(data.eventTypes).toContain("agent.xp")
    expect(data.eventTypes).toContain("payment.received")
    expect(data.eventTypes).not.toContain("agent.registry")
  })

  it("lists webhooks without exposing secrets", async () => {
    const { data: registered } = await registerWebhook()

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.webhooks).toHaveLength(1)
    expect(data.webhooks[0]).toMatchObject({
      id: registered.id,
      url: "https://partner.example/webhooks/open-stellar",
      events: ["agent.status", "quest.completed"],
    })
    expect(data.webhooks[0].createdAt).toEqual(expect.any(String))
    expect(data.webhooks[0]).not.toHaveProperty("secret")
  })

  it("deletes a registered webhook", async () => {
    const { data: registered } = await registerWebhook()

    const deleted = await DELETE(new Request(`http://localhost/api/webhooks/${registered.id}`, { method: "DELETE" }), context(registered.id))
    const deleteData = await deleted.json()
    const list = await GET()
    const listData = await list.json()

    expect(deleted.status).toBe(200)
    expect(deleteData.deleted).toBe(true)
    expect(listData.webhooks).toEqual([])
  })

  it("rotates a webhook secret without changing public registration fields", async () => {
    const { data: registered } = await registerWebhook()
    const before = await GET()
    const beforeData = await before.json()

    const rotated = await ROTATE_POST(
      new Request(`http://localhost/api/webhooks/${registered.id}/rotate`, { method: "POST" }),
      context(registered.id),
    )
    const rotatedData = await rotated.json() as { id: string; secret: string; cancelledRetries: number }
    const after = await GET()
    const afterData = await after.json()

    expect(rotated.status).toBe(200)
    expect(rotated.headers.get("Cache-Control")).toBe("no-store")
    expect(rotatedData.id).toBe(registered.id)
    expect(rotatedData.secret).toHaveLength(64)
    expect(rotatedData.secret).not.toBe(registered.secret)
    expect(rotatedData.cancelledRetries).toBe(0)
    expect(afterData.webhooks).toHaveLength(1)
    expect(afterData.webhooks[0]).toMatchObject({
      id: registered.id,
      url: "https://partner.example/webhooks/open-stellar",
      events: ["agent.status", "quest.completed"],
      createdAt: beforeData.webhooks[0].createdAt,
    })
    expect(afterData.webhooks[0]).not.toHaveProperty("secret")
  })

  it("returns 404 when rotating an unknown webhook", async () => {
    const res = await ROTATE_POST(
      new Request("http://localhost/api/webhooks/wh_missing/rotate", { method: "POST" }),
      context("wh_missing"),
    )
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(data.error).toBe("Webhook not found")
  })

  it("cancels pending retries on secret rotation and uses the new secret for new deliveries", async () => {
    vi.useFakeTimers()
    setWebhookRetryDelaysForTests([5_000, 30_000, 120_000])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    const pendingDelivery = deliverWebhookEvent({
      id: "evt_cancel_retry_on_rotate",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "quest.completed",
      agentId: "nexus-7",
      questId: "daily-complete-5-tasks",
      reward: { xp: 50 },
    })

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const rotated = await ROTATE_POST(
      new Request(`http://localhost/api/webhooks/${registered.id}/rotate`, { method: "POST" }),
      context(registered.id),
    )
    const rotatedData = await rotated.json() as { id: string; secret: string; cancelledRetries: number }

    expect(rotated.status).toBe(200)
    expect(rotatedData).toMatchObject({
      id: registered.id,
      cancelledRetries: 1,
    })

    await vi.advanceTimersByTimeAsync(120_000)
    await pendingDelivery
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await deliverWebhookEvent({
      id: "evt_agent_status_after_rotate",
      occurredAt: "2026-06-26T00:01:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = init.body as string
    const oldSignature = `sha256=${createHmac("sha256", registered.secret).update(body).digest("hex")}`
    const newSignature = `sha256=${createHmac("sha256", rotatedData.secret).update(body).digest("hex")}`

    expect(init.headers).toMatchObject({
      "X-Open-Stellar-Signature": newSignature,
    })
    expect(init.headers).not.toMatchObject({
      "X-Open-Stellar-Signature": oldSignature,
    })
  })

  it("cancels a persisted pending retry on secret rotation", async () => {
    const { data: registered } = await registerWebhook()
    enqueueWebhookRetry(registered.id, {
      type: "agent.status",
      payload: {
        id: "evt_persisted_retry_on_rotate",
        occurredAt: "2026-06-26T00:00:00.000Z",
        type: "agent.status",
        agentId: "nexus-7",
        status: "working",
      },
    }, "HTTP 503", 1_000)

    const rotated = await ROTATE_POST(
      new Request(`http://localhost/api/webhooks/${registered.id}/rotate`, { method: "POST" }),
      context(registered.id),
    )
    const rotatedData = await rotated.json() as { cancelledRetries: number }

    expect(rotatedData.cancelledRetries).toBe(1)
    expect(listWebhookRetryEntries()).toEqual([])
  })

  it("uses the rotated secret for webhook delivery signatures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()
    const rotated = await ROTATE_POST(
      new Request(`http://localhost/api/webhooks/${registered.id}/rotate`, { method: "POST" }),
      context(registered.id),
    )
    const rotatedData = await rotated.json() as { id: string; secret: string }

    await deliverWebhookEvent({
      id: "evt_agent_status_rotated",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = init.body as string
    const oldSignature = `sha256=${createHmac("sha256", registered.secret).update(body).digest("hex")}`
    const newSignature = `sha256=${createHmac("sha256", rotatedData.secret).update(body).digest("hex")}`

    expect(init.headers).toMatchObject({
      "X-Open-Stellar-Signature": newSignature,
    })
    expect(init.headers).not.toMatchObject({
      "X-Open-Stellar-Signature": oldSignature,
    })
  })

  it("delivers matching events with the expected payload and HMAC signature", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    publishSystemEvent({
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = init.body as string
    const payload = JSON.parse(body)
    const expectedSignature = `sha256=${createHmac("sha256", registered.secret).update(body).digest("hex")}`

    expect(url).toBe("https://partner.example/webhooks/open-stellar")
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Open-Stellar-Signature": expectedSignature,
    })
    expect(payload).toMatchObject({
      type: "agent.status",
      payload: {
        type: "agent.status",
        agentId: "nexus-7",
        status: "working",
      },
    })
    expect(payload.payload.id).toEqual(expect.any(String))
    expect(payload.payload.occurredAt).toEqual(expect.any(String))
  })

  it("retries once when delivery receives an error response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    await registerWebhook()

    publishSystemEvent({
      type: "quest.completed",
      agentId: "nexus-7",
      questId: "daily-complete-5-tasks",
      reward: { xp: 50 },
    })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const retryBody = fetchMock.mock.calls[1][1]?.body

    expect(fetchMock.mock.calls[1][0]).toBe("https://partner.example/webhooks/open-stellar")
    expect(retryBody).toBe(fetchMock.mock.calls[0][1]?.body)
  })

  it("logs delivery attempts with status and duration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    await deliverWebhookEvent({
      id: "evt_agent_status_1",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    const attempts = listWebhookDeliveryAttempts(registered.id)

    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({
      webhookId: registered.id,
      event: "agent.status",
      responseStatus: 204,
      ok: true,
      retried: false,
      attempt: 1,
    })
    expect(attempts[0].id).toMatch(/^wha_/)
    expect(attempts[0].deliveredAt).toEqual(expect.any(String))
    expect(attempts[0].durationMs).toEqual(expect.any(Number))
  })

  it("lists two deliveries newest-first without exposing secrets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    await deliverWebhookEvent({
      id: "evt_agent_status_1",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "idle",
    })
    await deliverWebhookEvent({
      id: "evt_agent_status_2",
      occurredAt: "2026-06-26T00:01:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    const res = await DELIVERIES_GET(
      new Request(`http://localhost/api/webhooks/${registered.id}/deliveries?limit=20`),
      context(registered.id),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.deliveries).toHaveLength(2)
    expect(data.deliveries[0]).toMatchObject({ event: "agent.status", responseStatus: 204, ok: true, retried: false })
    expect(data.deliveries[1]).toMatchObject({ event: "agent.status", responseStatus: 202, ok: true, retried: false })
    expect(Date.parse(data.deliveries[0].deliveredAt)).toBeGreaterThanOrEqual(Date.parse(data.deliveries[1].deliveredAt))
    expect(data.deliveries[0]).not.toHaveProperty("secret")

    const limited = await DELIVERIES_GET(
      new Request(`http://localhost/api/webhooks/${registered.id}/deliveries?limit=1`),
      context(registered.id),
    )
    const limitedData = await limited.json()

    expect(limitedData.deliveries).toHaveLength(1)
    expect(limitedData.deliveries[0].responseStatus).toBe(204)
  })

  it("logs initial and retry attempts with retried flags", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    await deliverWebhookEvent({
      id: "evt_quest_completed_1",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "quest.completed",
      agentId: "nexus-7",
      questId: "daily-complete-5-tasks",
      reward: { xp: 50 },
    })

    const attempts = listWebhookDeliveryAttempts(registered.id)
    const chronologicalAttempts = [...attempts].reverse()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(attempts).toHaveLength(3)
    expect(chronologicalAttempts).toMatchObject([
      { responseStatus: 500, ok: false, retried: false, attempt: 1 },
      { responseStatus: 500, ok: false, retried: true, attempt: 2 },
      { responseStatus: 204, ok: true, retried: true, attempt: 3 },
    ])
  })

  it("waits 5s then 30s before the successful third attempt", async () => {
    vi.useFakeTimers()
    setWebhookRetryDelaysForTests([5_000, 30_000, 120_000])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    await registerWebhook()

    const delivery = deliverWebhookEvent({
      id: "evt_quest_completed_delays",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "quest.completed",
      agentId: "nexus-7",
      questId: "daily-complete-5-tasks",
      reward: { xp: 50 },
    })

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)
    await delivery

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("records null status when fetch fails before a response and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    await deliverWebhookEvent({
      id: "evt_agent_status_1",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    const attempts = listWebhookDeliveryAttempts(registered.id)

    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toMatchObject({ responseStatus: null, ok: false, retried: false, attempt: 1 })
    expect(attempts[0]).toMatchObject({ responseStatus: 204, ok: true, retried: true, attempt: 2 })
  })

  it("logs the final failed attempt after all retries are exhausted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockRejectedValueOnce(new DOMException("timed out", "AbortError"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    await deliverWebhookEvent({
      id: "evt_agent_status_failed_retries",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    const attempts = listWebhookDeliveryAttempts(registered.id)
    const chronologicalAttempts = [...attempts].reverse()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(chronologicalAttempts).toMatchObject([
      { responseStatus: 500, ok: false, retried: false, attempt: 1 },
      { responseStatus: 502, ok: false, retried: true, attempt: 2 },
      { responseStatus: null, ok: false, retried: true, attempt: 3 },
      { responseStatus: 503, ok: false, retried: true, attempt: 4 },
    ])
    expect(attempts[0]).toMatchObject({ responseStatus: 503, ok: false, retried: true, attempt: 4 })
  })

  it("does not retry after a successful first response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    await deliverWebhookEvent({
      id: "evt_agent_status_success_no_retry",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    const attempts = listWebhookDeliveryAttempts(registered.id)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ responseStatus: 204, ok: true, retried: false, attempt: 1 })
  })

  it("logs each retry attempt separately", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    vi.stubGlobal("fetch", fetchMock)
    const { data: registered } = await registerWebhook()

    await deliverWebhookEvent({
      id: "evt_agent_status_retry_flags",
      occurredAt: "2026-06-26T00:00:00.000Z",
      type: "agent.status",
      agentId: "nexus-7",
      status: "working",
    })

    const attempts = listWebhookDeliveryAttempts(registered.id)
    const retryAttempts = attempts.filter((attempt) => attempt.retried)

    expect(attempts).toHaveLength(4)
    expect(retryAttempts).toHaveLength(3)
    expect(retryAttempts.map((attempt) => attempt.attempt)).toEqual([4, 3, 2])
  })

  it("returns 404 when listing deliveries for an unknown webhook", async () => {
    const res = await DELIVERIES_GET(
      new Request("http://localhost/api/webhooks/wh_missing/deliveries"),
      context("wh_missing"),
    )
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe("Webhook not found")
  })

  it("caps delivery log entries at 200 and evicts the oldest", () => {
    for (let i = 0; i < 201; i += 1) {
      appendWebhookDeliveryAttempt({
        webhookId: "wh_cap",
        event: `event.${i}`,
        deliveredAt: `2026-06-26T00:${String(i).padStart(2, "0")}:00.000Z`,
        durationMs: i,
        responseStatus: 204,
        ok: true,
        retried: false,
        attempt: 1,
        status: "success",
      })
    }

    const attempts = listWebhookDeliveryAttempts("wh_cap", 250)

    expect(attempts).toHaveLength(200)
    expect(attempts[0].event).toBe("event.200")
    expect(attempts[199].event).toBe("event.1")
    expect(attempts.some((attempt) => attempt.event === "event.0")).toBe(false)
  })
})
