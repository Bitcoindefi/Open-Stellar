import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { POST as moveAgent } from "@/app/api/agents/[id]/move/route"
import { GET as listPositionHistory } from "@/app/api/agents/[id]/positions/route"
import { GET as streamAgents } from "@/app/api/agents/stream/route"
import {
  getAgentPosition,
  listAgentPositionHistory,
  moveAgentPosition,
  resetAgentPositionHistoryDirectoryForTests,
  resetAgentPositionStoreForTests,
  setAgentPositionForTests,
  setAgentPositionHistoryDirectoryForTests,
  subscribeAgentPositionDeltas,
} from "@/lib/agents/agent-position-store"

let positionsDir: string

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

function historyFile(agentId: string) {
  return join(positionsDir, `${encodeURIComponent(agentId)}.jsonl`)
}

function readJsonl(agentId: string) {
  return readFileSync(historyFile(agentId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
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
  positionsDir = mkdtempSync(join(tmpdir(), "open-stellar-positions-"))
  setAgentPositionHistoryDirectoryForTests(positionsDir)
  resetAgentPositionStoreForTests()
  setAgentPositionForTests("bot-1", { pixelX: 10, pixelY: 20, targetX: 10, targetY: 20, direction: "right" })
  setAgentPositionForTests("bot-2", { pixelX: 100, pixelY: 200, targetX: 100, targetY: 200, direction: "left" })
})

afterEach(() => {
  delete process.env.MOLTBOT_GATEWAY_TOKEN
  resetAgentPositionStoreForTests()
  resetAgentPositionHistoryDirectoryForTests()
  rmSync(positionsDir, { recursive: true, force: true })
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

  it("persists each move as a JSONL history record", () => {
    moveAgentPosition("bot-1", { dx: 5, dy: -3 })

    expect(readJsonl("bot-1")).toEqual([
      expect.objectContaining({
        agentId: "bot-1",
        dx: 5,
        dy: -3,
        pixelX: 15,
        pixelY: 17,
        direction: "right",
      }),
    ])
    expect(readJsonl("bot-1")[0].updatedAt).toEqual(expect.any(String))
  })

  it("hydrates the latest position from JSONL after a reset", () => {
    const moved = moveAgentPosition("bot-1", { dx: -7, dy: 4 })

    resetAgentPositionStoreForTests()
    setAgentPositionHistoryDirectoryForTests(positionsDir)

    expect(getAgentPosition("bot-1")).toMatchObject({
      agentId: "bot-1",
      pixelX: moved.pixelX,
      pixelY: moved.pixelY,
      targetX: moved.pixelX,
      targetY: moved.pixelY,
      direction: "left",
      updatedAt: moved.updatedAt,
    })
  })

  it("keeps history bounded to the latest 1000 entries", () => {
    for (let index = 0; index < 1005; index += 1) {
      moveAgentPosition("bot-1", { dx: 1, dy: 0 })
    }

    const records = readJsonl("bot-1")

    expect(records).toHaveLength(1000)
    expect(records[0]).toMatchObject({ pixelX: 16 })
    expect(records.at(-1)).toMatchObject({ pixelX: 1015 })
    expect(listAgentPositionHistory("bot-1", 1000)).toHaveLength(1000)
  })

  it("accepts a 500-char agentId but stores it with a 200-char key", () => {
    const hugeId = "A".repeat(500)
    const clampedId = "A".repeat(200)

    setAgentPositionForTests(hugeId, { pixelX: 0, pixelY: 0, targetX: 0, targetY: 0, direction: "right" })
    moveAgentPosition(hugeId, { dx: 1, dy: 1 })

    expect(getAgentPosition(hugeId)).toMatchObject({ agentId: clampedId })
    expect(readJsonl(clampedId)).toEqual([
      expect.objectContaining({
        agentId: clampedId,
        dx: 1,
        dy: 1
      }),
    ])
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

describe("GET /api/agents/[id]/positions", () => {
  it("returns the latest 50 records by default", async () => {
    for (let index = 0; index < 55; index += 1) {
      moveAgentPosition("bot-1", { dx: 1, dy: 0 })
    }

    const res = await listPositionHistory(
      new Request("http://localhost/api/agents/bot-1/positions"),
      context("bot-1"),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.positions).toHaveLength(50)
    expect(data.positions[0]).toMatchObject({ pixelX: 65 })
    expect(data.positions.at(-1)).toMatchObject({ pixelX: 16 })
  })

  it("accepts limits from 1 to 1000 and handles invalid values safely", async () => {
    for (let index = 0; index < 60; index += 1) {
      moveAgentPosition("bot-1", { dx: 1, dy: 0 })
    }

    const one = await listPositionHistory(
      new Request("http://localhost/api/agents/bot-1/positions?limit=1"),
      context("bot-1"),
    )
    const oneData = await one.json()

    const high = await listPositionHistory(
      new Request("http://localhost/api/agents/bot-1/positions?limit=1000"),
      context("bot-1"),
    )
    const highData = await high.json()

    const tooLow = await listPositionHistory(
      new Request("http://localhost/api/agents/bot-1/positions?limit=0"),
      context("bot-1"),
    )
    const tooLowData = await tooLow.json()

    const invalid = await listPositionHistory(
      new Request("http://localhost/api/agents/bot-1/positions?limit=wat"),
      context("bot-1"),
    )
    const invalidData = await invalid.json()

    const blank = await listPositionHistory(
      new Request("http://localhost/api/agents/bot-1/positions?limit="),
      context("bot-1"),
    )
    const blankData = await blank.json()

    expect(oneData.positions).toHaveLength(1)
    expect(oneData.positions[0]).toMatchObject({ pixelX: 70 })
    expect(highData.positions).toHaveLength(60)
    expect(tooLowData.positions).toHaveLength(1)
    expect(invalidData.positions).toHaveLength(50)
    expect(blankData.positions).toHaveLength(50)
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
