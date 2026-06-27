import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as FAILURES_GET } from "@/app/api/agents/[id]/webhooks/failures/route"
import { POST as CRON_POST } from "@/app/api/cron/webhook-retry/route"
import { POST as WEBHOOK_POST } from "@/app/api/webhooks/route"
import {
  deliverWebhookEvent,
  resetWebhookRetryDelayForTests,
  setWebhookRetryDelayForTests,
  type WebhookPayload,
} from "@/lib/webhooks/delivery"
import {
  resetWebhookDeliveryLogForTests,
  resetWebhookDeliveryLogPathForTests,
  setWebhookDeliveryLogPathForTests,
} from "@/lib/webhooks/delivery-log"
import {
  calculateWebhookRetryDelay,
  enqueueWebhookRetry,
  getDueWebhookRetryEntries,
  getRetryEntryAgentId,
  listWebhookRetryEntries,
  recordWebhookRetryFailure,
  removePendingWebhookRetries,
  removeWebhookRetryEntry,
  resetWebhookRetryStorePathForTests,
  setWebhookRetryStorePathForTests,
} from "@/lib/webhooks/retry-store"
import {
  resetWebhookStoreForTests,
  resetWebhookStorePathForTests,
  setWebhookStorePathForTests,
} from "@/lib/webhooks/store"

const payload: WebhookPayload = {
  type: "agent.status",
  payload: {
    id: "evt_retry_store",
    occurredAt: "2026-06-27T00:00:00.000Z",
    type: "agent.status",
    agentId: "agent-a",
    status: "working",
  },
}

describe("webhook retry store", () => {
  let testDir: string
  let storePath: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "open-stellar-webhook-retry-"))
    storePath = join(testDir, "webhook-retry-queue.json")
    setWebhookRetryStorePathForTests(storePath)
    setWebhookStorePathForTests(join(testDir, "webhooks.json"))
    setWebhookDeliveryLogPathForTests(join(testDir, "webhook-delivery-log.jsonl"))
    resetWebhookStoreForTests()
    resetWebhookDeliveryLogForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetWebhookRetryDelayForTests()
    resetWebhookRetryStorePathForTests()
    resetWebhookStorePathForTests()
    resetWebhookDeliveryLogPathForTests()
    rmSync(testDir, { recursive: true, force: true })
  })

  it("persists a failed delivery with the exact first retry schedule", () => {
    const entry = enqueueWebhookRetry("wh_agent_a", payload, "HTTP 503", 1_000)

    expect(entry).toEqual({
      id: expect.stringMatching(/^whr_/),
      webhookId: "wh_agent_a",
      payload,
      attempts: 1,
      nextRetryAt: 3_000,
      lastError: "HTTP 503",
      createdAt: 1_000,
      status: "pending",
    })
    expect(listWebhookRetryEntries()).toEqual([entry])
  })

  it("reloads persisted entries from disk", () => {
    const entry = enqueueWebhookRetry("wh_agent_a", payload, "network down", 5_000)

    resetWebhookRetryStorePathForTests()
    setWebhookRetryStorePathForTests(storePath)

    expect(listWebhookRetryEntries()).toEqual([entry])
  })

  it("does not duplicate the same webhook event failure", () => {
    const first = enqueueWebhookRetry("wh_agent_a", payload, "HTTP 500", 1_000)
    const second = enqueueWebhookRetry("wh_agent_a", payload, "HTTP 502", 2_000)

    expect(second).toMatchObject({
      id: first.id,
      attempts: 1,
      lastError: "HTTP 502",
      nextRetryAt: 4_000,
      createdAt: 1_000,
    })
    expect(listWebhookRetryEntries()).toHaveLength(1)
  })

  it("calculates exponential retry delays and caps them at one hour", () => {
    expect([1, 2, 3, 4].map(calculateWebhookRetryDelay)).toEqual([
      2_000,
      4_000,
      8_000,
      16_000,
    ])
    expect(calculateWebhookRetryDelay(20)).toBe(3_600_000)
  })

  it("defensively reads the agent id from the webhook payload", () => {
    const entry = enqueueWebhookRetry("wh_agent_a", payload, "HTTP 500", 1_000)

    expect(getRetryEntryAgentId(entry)).toBe("agent-a")
    expect(getRetryEntryAgentId({
      ...entry,
      payload: {
        type: "district.unlocked",
        payload: {
          id: "evt_agentless",
          occurredAt: "2026-06-27T00:00:00.000Z",
          type: "district.unlocked",
        },
      },
    })).toBeNull()
    expect(getRetryEntryAgentId({ ...entry, payload: null as unknown as WebhookPayload })).toBeNull()
  })

  it("selects only pending entries that are due", () => {
    const entry = enqueueWebhookRetry("wh_agent_a", payload, "HTTP 500", 1_000)

    expect(getDueWebhookRetryEntries(2_999)).toEqual([])
    expect(getDueWebhookRetryEntries(3_000)).toEqual([entry])
  })

  it("increments failed retries and marks the fifth failure dead", () => {
    const entry = enqueueWebhookRetry("wh_agent_a", payload, "HTTP 500", 1_000)

    const second = recordWebhookRetryFailure(entry.id, "HTTP 502", 3_000)
    expect(second).toMatchObject({
      attempts: 2,
      nextRetryAt: 7_000,
      lastError: "HTTP 502",
      status: "pending",
    })

    recordWebhookRetryFailure(entry.id, "HTTP 503", 7_000)
    recordWebhookRetryFailure(entry.id, "HTTP 504", 15_000)
    const dead = recordWebhookRetryFailure(entry.id, "network down", 31_000)

    expect(dead).toMatchObject({
      attempts: 5,
      nextRetryAt: 31_000,
      lastError: "network down",
      status: "dead",
    })
    expect(getDueWebhookRetryEntries(100_000)).toEqual([])
  })

  it("removes successful entries and pending entries cancelled by rotation", () => {
    const first = enqueueWebhookRetry("wh_agent_a", payload, "HTTP 500", 1_000)
    const second = enqueueWebhookRetry("wh_agent_b", {
      ...payload,
      payload: { ...payload.payload, id: "evt_other" },
    }, "HTTP 500", 1_000)

    expect(removeWebhookRetryEntry(first.id)).toBe(true)
    expect(removePendingWebhookRetries("wh_agent_b")).toBe(1)
    expect(removePendingWebhookRetries("wh_agent_b")).toBe(0)
    expect(listWebhookRetryEntries()).toEqual([])
    expect(second.webhookId).toBe("wh_agent_b")
  })
})

function webhookRequest(): Request {
  return new Request("http://localhost/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://partner.example/webhooks/open-stellar",
      events: ["agent.status"],
    }),
  })
}

async function registerWebhook(): Promise<{ id: string; secret: string }> {
  const response = await WEBHOOK_POST(webhookRequest())
  return await response.json() as { id: string; secret: string }
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe("persistent webhook retries", () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "open-stellar-webhook-retry-routes-"))
    setWebhookRetryStorePathForTests(join(testDir, "webhook-retry-queue.json"))
    setWebhookStorePathForTests(join(testDir, "webhooks.json"))
    setWebhookDeliveryLogPathForTests(join(testDir, "webhook-delivery-log.jsonl"))
    resetWebhookStoreForTests()
    resetWebhookDeliveryLogForTests()
    setWebhookRetryDelayForTests(0)
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetWebhookRetryDelayForTests()
    resetWebhookRetryStorePathForTests()
    resetWebhookStorePathForTests()
    resetWebhookDeliveryLogPathForTests()
    delete process.env.CRON_SECRET
    rmSync(testDir, { recursive: true, force: true })
  })

  it("queues one persistent retry after in-memory delivery attempts are exhausted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(Date, "now").mockReturnValue(1_000)
    const webhook = await registerWebhook()

    await deliverWebhookEvent(payload.payload)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(listWebhookRetryEntries()).toEqual([
      {
        id: expect.stringMatching(/^whr_/),
        webhookId: webhook.id,
        payload,
        attempts: 1,
        nextRetryAt: 3_000,
        lastError: "HTTP 503",
        createdAt: 1_000,
        status: "pending",
      },
    ])
  })

  it("cron retry succeeds and clears the queue entry", async () => {
    const webhook = await registerWebhook()
    enqueueWebhookRetry(webhook.id, payload, "HTTP 503", 1_000)
    vi.spyOn(Date, "now").mockReturnValue(3_000)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    const response = await CRON_POST(new Request("http://localhost/api/cron/webhook-retry", { method: "POST" }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      processed: 1,
      succeeded: 1,
      failed: 0,
      dead: 0,
    })
    expect(listWebhookRetryEntries()).toEqual([])
  })

  it("cron retry failure increments attempts and schedules the next retry", async () => {
    const webhook = await registerWebhook()
    enqueueWebhookRetry(webhook.id, payload, "HTTP 503", 1_000)
    vi.spyOn(Date, "now").mockReturnValue(3_000)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })))

    const response = await CRON_POST(new Request("http://localhost/api/cron/webhook-retry", { method: "POST" }))

    expect(await response.json()).toEqual({
      ok: true,
      processed: 1,
      succeeded: 0,
      failed: 1,
      dead: 0,
    })
    expect(listWebhookRetryEntries()[0]).toMatchObject({
      attempts: 2,
      nextRetryAt: 7_000,
      lastError: "HTTP 502",
      status: "pending",
    })
  })

  it("cron marks an entry dead after the fifth failed attempt", async () => {
    const webhook = await registerWebhook()
    const entry = enqueueWebhookRetry(webhook.id, payload, "HTTP 500", 1_000)
    recordWebhookRetryFailure(entry.id, "HTTP 501", 3_000)
    recordWebhookRetryFailure(entry.id, "HTTP 502", 7_000)
    recordWebhookRetryFailure(entry.id, "HTTP 503", 15_000)
    vi.spyOn(Date, "now").mockReturnValue(31_000)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    const response = await CRON_POST(new Request("http://localhost/api/cron/webhook-retry", { method: "POST" }))

    expect(await response.json()).toEqual({
      ok: true,
      processed: 1,
      succeeded: 0,
      failed: 1,
      dead: 1,
    })
    expect(listWebhookRetryEntries()[0]).toMatchObject({
      attempts: 5,
      nextRetryAt: 31_000,
      lastError: "ECONNREFUSED",
      status: "dead",
    })
  })

  it("uses the existing cron bearer authorization pattern", async () => {
    process.env.CRON_SECRET = "retry-secret"

    const response = await CRON_POST(new Request("http://localhost/api/cron/webhook-retry", { method: "POST" }))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized cron request" })
  })

  it("returns dead failures only for the agent id in the payload", async () => {
    const entry = enqueueWebhookRetry("wh_agent_a", payload, "HTTP 500", 1_000)
    recordWebhookRetryFailure(entry.id, "HTTP 501", 3_000)
    recordWebhookRetryFailure(entry.id, "HTTP 502", 7_000)
    recordWebhookRetryFailure(entry.id, "HTTP 503", 15_000)
    recordWebhookRetryFailure(entry.id, "ECONNREFUSED", 31_000)

    const agentAResponse = await FAILURES_GET(
      new Request("http://localhost/api/agents/agent-a/webhooks/failures"),
      routeContext("agent-a"),
    )
    const agentBResponse = await FAILURES_GET(
      new Request("http://localhost/api/agents/agent-b/webhooks/failures"),
      routeContext("agent-b"),
    )

    expect(agentAResponse.status).toBe(200)
    expect(await agentAResponse.json()).toEqual([
      expect.objectContaining({
        webhookId: "wh_agent_a",
        attempts: 5,
        lastError: "ECONNREFUSED",
        payload,
        status: "dead",
      }),
    ])
    expect(await agentBResponse.json()).toEqual([])
  })
})
