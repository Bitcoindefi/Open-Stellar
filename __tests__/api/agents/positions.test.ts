import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { POST as moveAgent } from "@/app/api/agents/[id]/move/route"
import { GET as streamAgents } from "@/app/api/agents/stream/route"
import {
  getAgentPosition,
  moveAgentPosition,
  resetAgentPositionStoreForTests,
  setAgentPositionForTests,
  subscribeAgentPositionDeltas,
} from "@/lib/agents/agent-position-store"

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function readStreamText(res: Response, publish: () => void) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("missing response stream")

  const first = await reader.read()
  publish()
  const second = await reader.read()
  await reader.cancel()

  return new TextDecoder().decode(first.value) + new TextDecoder().decode(second.value)
}

beforeEach(() => {
  resetAgentPositionStoreForTests()
  setAgentPositionForTests("bot-1", { pixelX: 10, pixelY: 20, targetX: 10, targetY: 20, direction: "right" })
  setAgentPositionForTests("bot-2", { pixelX: 100, pixelY: 200, targetX: 100, targetY: 200, direction: "left" })
})

afterEach(() => {
  delete process.env.MOLTBOT_GATEWAY_TOKEN
  resetAgentPositionStoreForTests()
})

describe("agent position store", () => {
  it("moves only the requested agent and publishes a single-agent delta", () => {
    const deltas: unknown[] = []
    const unsubscribe = subscribeAgentPositionDeltas((delta) => {
      deltas.push(delta)
    })

    const moved = moveAgentPosition("bot-1", { dx: 5, dy: -3 })
    unsubscribe()

    expect(moved.pixelX).toBe(15)
    expect(moved.pixelY).toBe(17)
    expect(moved.direction).toBe("right")
    expect(getAgentPosition("bot-2")).toMatchObject({ pixelX: 100, pixelY: 200 })
    expect(deltas).toHaveLength(1)
    expect(deltas[0]).toMatchObject({
      type: "agent.position",
      agents: [
        {
          agentId: "bot-1",
          dx: 5,
          dy: -3,
          pixelX: 15,
          pixelY: 17,
        },
      ],
    })
  })
})

describe("POST /api/agents/[id]/move", () => {
  it("requires MOLTBOT_GATEWAY_TOKEN bearer auth", async () => {
    process.env.MOLTBOT_GATEWAY_TOKEN = "secret-token"

    const res = await moveAgent(new Request("http://localhost/api/agents/bot-1/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dx: 1, dy: 2 }),
    }), context("bot-1"))

    expect(res.status).toBe(401)
  })

  it("updates the requested server-side position when authorized", async () => {
    process.env.MOLTBOT_GATEWAY_TOKEN = "secret-token"

    const res = await moveAgent(new Request("http://localhost/api/agents/bot-1/move", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dx: -4, dy: 6 }),
    }), context("bot-1"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.position).toMatchObject({ agentId: "bot-1", pixelX: 6, pixelY: 26, direction: "left" })
    expect(getAgentPosition("bot-2")).toMatchObject({ pixelX: 100, pixelY: 200 })
  })

  it("rejects invalid move bodies", async () => {
    process.env.MOLTBOT_GATEWAY_TOKEN = "secret-token"

    const res = await moveAgent(new Request("http://localhost/api/agents/bot-1/move", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dx: "far", dy: 1 }),
    }), context("bot-1"))

    expect(res.status).toBe(400)
  })
})

describe("GET /api/agents/stream", () => {
  it("opens an SSE stream with retry and sends move deltas for changed agents only", async () => {
    const res = await streamAgents()

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(res.headers.get("cache-control")).toContain("no-cache")

    const text = await readStreamText(res, () => {
      moveAgentPosition("bot-2", { dx: 2, dy: 3 })
    })

    expect(text).toContain("retry: 3000")
    expect(text).toContain("event: agent.positions.snapshot")
    expect(text).toContain("event: agent.position")
    expect(text).toContain('"agentId":"bot-2"')
    expect(text).toContain('"dx":2')
    expect(text).toContain('"dy":3')
    expect(text).not.toContain('"agentId":"bot-1","dx"')
  })
})
