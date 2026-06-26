import { createHmac } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DELETE } from "@/app/api/webhooks/[id]/route"
import { GET, POST } from "@/app/api/webhooks/route"
import { publishSystemEvent } from "@/lib/events/system-events"
import {
  resetWebhookRetryDelayForTests,
  setWebhookRetryDelayForTests,
} from "@/lib/webhooks/delivery"
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
    resetWebhookStoreForTests()
    setWebhookRetryDelayForTests(0)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetWebhookRetryDelayForTests()
    resetWebhookStorePathForTests()
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
})
