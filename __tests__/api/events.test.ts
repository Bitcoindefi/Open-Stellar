import { describe, expect, it } from "vitest"
import { GET as getEvents } from "@/app/api/events/route"
import { GET as getAgentEvents } from "@/app/api/events/[agentId]/route"
import { POST as postQuote } from "@/app/api/protocol/x402/quote/route"
import { POST as postSettle } from "@/app/api/protocol/x402/settle/route"
import { publishSystemEvent } from "@/lib/events/system-events"

async function readStreamText(res: Response, publish: () => void) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("missing response stream")

  const first = await reader.read()
  publish()
  const second = await reader.read()
  await reader.cancel()

  return new TextDecoder().decode(first.value) + new TextDecoder().decode(second.value)
}

async function makeQuote(payer = "bot-2") {
  const req = new Request("http://localhost/api/protocol/x402/quote", {
    method: "POST",
    body: JSON.stringify({
      serviceId: "event-stream-test",
      chain: "stellar",
      payer,
      units: 1,
      unitPriceUsd: 0.05,
      ttlSeconds: 300,
    }),
    headers: { "Content-Type": "application/json" },
  })
  const res = await postQuote(req)
  return res.json()
}

describe("GET /api/events", () => {
  it("opens a server-sent events stream with no-cache headers", async () => {
    const res = await getEvents()

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(res.headers.get("cache-control")).toContain("no-cache")
  })

  it("forwards published events as SSE frames", async () => {
    const res = await getEvents()
    const text = await readStreamText(res, () => {
      publishSystemEvent({
        type: "task.completed",
        agentId: "bot-1",
        taskId: "task-123",
        result: { summary: "indexed fresh receipts" },
      })
    })

    expect(text).toContain("event: task.completed")
    expect(text).toContain('"agentId":"bot-1"')
    expect(text).toContain('"taskId":"task-123"')
  })

  it("exposes quest completion payloads as SSE frames", async () => {
    const res = await getEvents()
    const text = await readStreamText(res, () => {
      publishSystemEvent({
        type: "quest.completed",
        agentId: "quest-agent",
        questId: "daily-complete-5-tasks",
        quest: {
          id: "daily-complete-5-tasks",
          title: "Complete 5 tasks",
        },
        reward: {
          xp: 50,
          xlm: "0.05",
        },
      })
    })

    expect(text).toContain("event: quest.completed")
    expect(text).toContain('"agentId":"quest-agent"')
    expect(text).toContain('"questId":"daily-complete-5-tasks"')
    expect(text).toContain('"title":"Complete 5 tasks"')
    expect(text).toContain('"xp":50')
    expect(text).toContain('"xlm":"0.05"')
  })
})

describe("GET /api/events/[agentId]", () => {
  it("filters events to the requested agent", async () => {
    const res = await getAgentEvents(new Request("http://localhost/api/events/bot-2"), {
      params: Promise.resolve({ agentId: "bot-2" }),
    })

    const text = await readStreamText(res, () => {
      publishSystemEvent({
        type: "task.completed",
        agentId: "bot-9",
        taskId: "ignored",
        result: { summary: "wrong agent" },
      })
      publishSystemEvent({
        type: "agent.status",
        agentId: "bot-2",
        status: "working",
      })
    })

    expect(text).toContain("event: agent.status")
    expect(text).toContain('"agentId":"bot-2"')
    expect(text).not.toContain("ignored")
  })
})

describe("x402 settlement event publishing", () => {
  it("emits payment.received when a quote settles", async () => {
    const events: string[] = []
    const res = await getAgentEvents(new Request("http://localhost/api/events/bot-2"), {
      params: Promise.resolve({ agentId: "bot-2" }),
    })
    const reader = res.body!.getReader()
    const first = await reader.read()
    events.push(new TextDecoder().decode(first.value))

    const quoteData = await makeQuote("bot-2")
    const settleReq = new Request("http://localhost/api/protocol/x402/settle", {
      method: "POST",
      body: JSON.stringify({
        paymentRef: quoteData.quote.paymentRef,
        chain: "stellar",
        txHash: `0x${"a".repeat(64)}`,
        paidBy: "bot-2",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const settleRes = await postSettle(settleReq)
    const second = await reader.read()
    await reader.cancel()
    events.push(new TextDecoder().decode(second.value))

    expect(settleRes.status).toBe(200)
    expect(events.join("")).toContain("event: payment.received")
    expect(events.join("")).toContain('"agentId":"bot-2"')
  })
})
