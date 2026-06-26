import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  getAgentPositionHistoryPaginated,
  resetAgentPositionStoreForTests,
  setAgentPositionHistoryDirectoryForTests,
  moveAgentPosition,
  setAgentPositionForTests,
} from "@/lib/agents/agent-position-store"
import { GET } from "@/app/api/agents/[id]/positions/route"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "agent-pos-test-"))
}

function seedHistoryFile(dir: string, agentId: string, count: number) {
  const filePath = join(dir, `${encodeURIComponent(agentId)}.jsonl`)
  const lines: string[] = []
  const baseTime = new Date("2026-06-01T00:00:00.000Z").getTime()

  for (let i = 0; i < count; i++) {
    const ts = new Date(baseTime + i * 60000).toISOString()
    lines.push(JSON.stringify({
      agentId,
      dx: 1,
      dy: 0,
      pixelX: 100 + i,
      pixelY: 200,
      direction: "right",
      updatedAt: ts,
    }))
  }

  writeFileSync(filePath, lines.join("\n") + "\n", "utf8")
}

describe("agent position history pagination", () => {
  let tempDir: string

  beforeEach(() => {
    resetAgentPositionStoreForTests()
    tempDir = makeTempDir()
    setAgentPositionHistoryDirectoryForTests(tempDir)
    setAgentPositionForTests("agent-paginate", {
      pixelX: 100,
      pixelY: 200,
      targetX: 100,
      targetY: 200,
      direction: "right",
    })
  })

  afterEach(() => {
    resetAgentPositionStoreForTests()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("default response is capped at 50 entries, newest first", () => {
    seedHistoryFile(tempDir, "agent-paginate", 200)

    const result = getAgentPositionHistoryPaginated("agent-paginate")

    expect(result.positions).toHaveLength(50)
    expect(result.total).toBe(200)
    expect(result.returned).toBe(50)
    expect(result.oldest).toBe("2026-06-01T00:00:00.000Z")
    expect(result.newest).toBe("2026-06-01T03:19:00.000Z")

    // Newest first
    expect(result.positions[0].updatedAt).toBe("2026-06-01T03:19:00.000Z")
    expect(result.positions[49].updatedAt).toBe("2026-06-01T02:30:00.000Z")
  })

  it("limit=10 returns at most 10 entries", () => {
    seedHistoryFile(tempDir, "agent-paginate", 200)

    const result = getAgentPositionHistoryPaginated("agent-paginate", { limit: 10 })

    expect(result.positions).toHaveLength(10)
    expect(result.total).toBe(200)
    expect(result.returned).toBe(10)
  })

  it("before=<ts> excludes entries at or after that timestamp", () => {
    seedHistoryFile(tempDir, "agent-paginate", 200)

    const result = getAgentPositionHistoryPaginated("agent-paginate", {
      limit: 100,
      before: "2026-06-01T01:00:00.000Z",
    })

    // All entries should be before 01:00:00
    for (const pos of result.positions) {
      expect(new Date(pos.updatedAt).getTime()).toBeLessThan(
        new Date("2026-06-01T01:00:00.000Z").getTime(),
      )
    }
  })

  it("after=<ts> excludes entries at or before that timestamp", () => {
    seedHistoryFile(tempDir, "agent-paginate", 200)

    const result = getAgentPositionHistoryPaginated("agent-paginate", {
      limit: 100,
      after: "2026-06-01T02:00:00.000Z",
    })

    for (const pos of result.positions) {
      expect(new Date(pos.updatedAt).getTime()).toBeGreaterThan(
        new Date("2026-06-01T02:00:00.000Z").getTime(),
      )
    }
  })

  it("total always reflects the full unfiltered count", () => {
    seedHistoryFile(tempDir, "agent-paginate", 200)

    const result1 = getAgentPositionHistoryPaginated("agent-paginate", { limit: 10 })
    expect(result1.total).toBe(200)

    const result2 = getAgentPositionHistoryPaginated("agent-paginate", {
      limit: 100,
      before: "2026-06-01T01:00:00.000Z",
    })
    expect(result2.total).toBe(200)
  })

  it("handles empty history gracefully", () => {
    const result = getAgentPositionHistoryPaginated("agent-paginate")
    expect(result.positions).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.returned).toBe(0)
    expect(result.oldest).toBeNull()
    expect(result.newest).toBeNull()
  })
})

describe("GET /api/agents/[id]/positions", () => {
  let tempDir: string

  beforeEach(() => {
    resetAgentPositionStoreForTests()
    tempDir = makeTempDir()
    setAgentPositionHistoryDirectoryForTests(tempDir)
    setAgentPositionForTests("agent-api", {
      pixelX: 100,
      pixelY: 200,
      targetX: 100,
      targetY: 200,
      direction: "right",
    })
  })

  afterEach(() => {
    resetAgentPositionStoreForTests()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("falls back to default limit when limit > 1000", async () => {
    seedHistoryFile(tempDir, "agent-api", 200)

    const req = new Request("http://localhost/api/agents/agent-api/positions?limit=1001")
    const res = await GET(req, { params: Promise.resolve({ id: "agent-api" }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.positions).toHaveLength(200) // capped at 1000 but only 200 exist
  })

  it("falls back to default limit when limit is not a positive integer", async () => {
    seedHistoryFile(tempDir, "agent-api", 200)

    const req = new Request("http://localhost/api/agents/agent-api/positions?limit=abc")
    const res = await GET(req, { params: Promise.resolve({ id: "agent-api" }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.positions).toHaveLength(50) // default fallback
  })

  it("returns enriched response with total, returned, oldest, newest", async () => {
    seedHistoryFile(tempDir, "agent-api", 75)

    const req = new Request("http://localhost/api/agents/agent-api/positions")
    const res = await GET(req, { params: Promise.resolve({ id: "agent-api" }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.positions).toHaveLength(50)
    expect(body.total).toBe(75)
    expect(body.returned).toBe(50)
    expect(body.oldest).toBeDefined()
    expect(body.newest).toBeDefined()
  })

  it("respects limit query param", async () => {
    seedHistoryFile(tempDir, "agent-api", 200)

    const req = new Request("http://localhost/api/agents/agent-api/positions?limit=5")
    const res = await GET(req, { params: Promise.resolve({ id: "agent-api" }) })

    const body = await res.json()
    expect(body.positions).toHaveLength(5)
    expect(body.returned).toBe(5)
    expect(body.total).toBe(200)
  })

  it("respects before query param", async () => {
    seedHistoryFile(tempDir, "agent-api", 200)

    const req = new Request("http://localhost/api/agents/agent-api/positions?before=2026-06-01T01:00:00.000Z")
    const res = await GET(req, { params: Promise.resolve({ id: "agent-api" }) })

    const body = await res.json()
    expect(body.ok).toBe(true)
    for (const pos of body.positions) {
      expect(new Date(pos.updatedAt).getTime()).toBeLessThan(
        new Date("2026-06-01T01:00:00.000Z").getTime(),
      )
    }
  })

  it("respects after query param", async () => {
    seedHistoryFile(tempDir, "agent-api", 200)

    const req = new Request("http://localhost/api/agents/agent-api/positions?after=2026-06-01T02:00:00.000Z")
    const res = await GET(req, { params: Promise.resolve({ id: "agent-api" }) })

    const body = await res.json()
    expect(body.ok).toBe(true)
    for (const pos of body.positions) {
      expect(new Date(pos.updatedAt).getTime()).toBeGreaterThan(
        new Date("2026-06-01T02:00:00.000Z").getTime(),
      )
    }
  })
})
