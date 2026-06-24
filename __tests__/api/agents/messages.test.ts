import { beforeEach, describe, expect, it } from "vitest"
import { GET as getMessages, POST as postMessage } from "@/app/api/agents/[id]/messages/route"
import { GET as getDistrictMessages, POST as postDistrictMessage } from "@/app/api/districts/[districtId]/broadcast/route"
import {
  listAgentMessages,
  resetAgentMessagesForTests,
  sendAgentMessage,
  subscribeToAgentMessages,
} from "@/lib/agent-runtime/messaging"

function agentContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function districtContext(districtId: string) {
  return { params: Promise.resolve({ districtId }) }
}

async function readMessageStream(res: Response, publish: () => void) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("missing response stream")

  const first = await reader.read()
  publish()
  const second = await reader.read()
  await reader.cancel()

  return new TextDecoder().decode(first.value) + new TextDecoder().decode(second.value)
}

beforeEach(() => {
  resetAgentMessagesForTests()
})

describe("agent messaging protocol", () => {
  it("stores direct task request messages", () => {
    const message = sendAgentMessage({
      fromAgentId: "bot-0",
      toAgentId: "bot-1",
      type: "task.request",
      payload: { task: "analyze dataset" },
    })

    expect(message.id).toContain("task_request")
    expect(listAgentMessages("bot-1")[0]).toMatchObject({
      fromAgentId: "bot-0",
      toAgentId: "bot-1",
      type: "task.request",
    })
  })

  it("notifies subscribed agents over the message bus", () => {
    const received: string[] = []
    const unsubscribe = subscribeToAgentMessages("bot-2", (message) => received.push(message.id))

    const message = sendAgentMessage({
      fromAgentId: "bot-0",
      toAgentId: "bot-2",
      type: "data.share",
      payload: { rows: 42 },
    })
    unsubscribe()

    expect(received).toEqual([message.id])
  })

  it("serves direct message POST and list APIs", async () => {
    const post = await postMessage(new Request("http://localhost/api/agents/bot-3/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAgentId: "bot-0",
        type: "status.query",
        payload: { fields: ["cpu", "memory"] },
      }),
    }), agentContext("bot-3"))
    const postBody = await post.json()

    expect(post.status).toBe(201)
    expect(postBody.message.toAgentId).toBe("bot-3")

    const list = await getMessages(new Request("http://localhost/api/agents/bot-3/messages"), agentContext("bot-3"))
    const listBody = await list.json()

    expect(list.status).toBe(200)
    expect(listBody.messages).toHaveLength(1)
    expect(listBody.messages[0].type).toBe("status.query")
  })

  it("broadcasts district messages", async () => {
    const post = await postDistrictMessage(new Request("http://localhost/api/districts/data-center/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAgentId: "bot-0",
        type: "chat",
        payload: { text: "all data-center agents report status" },
      }),
    }), districtContext("data-center"))
    const postBody = await post.json()

    expect(post.status).toBe(201)
    expect(postBody.message.toAgentId).toBe("broadcast")
    expect(postBody.message.districtId).toBe("data-center")

    const list = await getDistrictMessages(new Request("http://localhost/api/districts/data-center/broadcast"), districtContext("data-center"))
    const listBody = await list.json()

    expect(listBody.messages).toHaveLength(1)
    expect(listBody.messages[0].payload.text).toContain("report status")
  })

  it("streams incoming messages as SSE frames", async () => {
    const res = await getMessages(new Request("http://localhost/api/agents/bot-4/messages?stream=1"), agentContext("bot-4"))
    const text = await readMessageStream(res, () => {
      sendAgentMessage({
        fromAgentId: "bot-0",
        toAgentId: "bot-4",
        type: "task.response",
        payload: { result: "complete" },
      })
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(text).toContain("event: agent.message")
    expect(text).toContain('"type":"task.response"')
  })
})
