import { describe, it, expect, beforeEach } from "vitest"
import { POST as drainPost } from "@/app/api/agents/[id]/tasks/drain/route"
import { POST as createPost, DELETE as purgeDel } from "@/app/api/agents/[id]/tasks/route"
import { resetTaskQueue } from "@/lib/agents/task-queue"

async function mockContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) } as any
}

async function createTask(agentId: string, type: string) {
  const req = new Request("http://localhost/api/agents/test/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload: { data: "test" } }),
  })
  const context = await mockContext({ id: agentId })
  const response = await createPost(req, context)
  return response.json()
}

describe("POST /api/agents/:id/tasks/drain", () => {
  beforeEach(() => {
    resetTaskQueue()
  })

  it("processes all pending tasks", async () => {
    await createTask("agent-1", "payment")
    await createTask("agent-1", "indexing")
    await createTask("agent-1", "verification")

    const req = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const context = await mockContext({ id: "agent-1" })
    const response = await drainPost(req, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.processed).toBe(3)
    expect(data.skipped).toBe(0)
    expect(data.errors).toHaveLength(0)
    expect(data.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("returns empty result when queue is empty", async () => {
    const req = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    const context = await mockContext({ id: "agent-1" })
    const response = await drainPost(req, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.processed).toBe(0)
  })

  it("respects maxItems parameter", async () => {
    for (let i = 0; i < 20; i++) {
      await createTask("agent-1", `task-${i}`)
    }

    const req = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxItems: 10 }),
    })
    const context = await mockContext({ id: "agent-1" })
    const response = await drainPost(req, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.processed).toBe(10)
  })

  it("caps maxItems at 200", async () => {
    // Create 250 tasks (MAX_PENDING_PER_AGENT=100 limits to 100)
    for (let i = 0; i < 250; i++) {
      await createTask("agent-1", `task-${i}`)
    }

    const req = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxItems: 300 }),
    })
    const context = await mockContext({ id: "agent-1" })
    const response = await drainPost(req, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.processed).toBe(100)
  })

  it("uses default maxItems when not specified", async () => {
    for (let i = 0; i < 100; i++) {
      await createTask("agent-1", `task-${i}`)
    }

    const req = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
    })
    const context = await mockContext({ id: "agent-1" })
    const response = await drainPost(req, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.processed).toBe(50) // Default is 50
  })

  it("returns 409 on concurrent drain attempts", async () => {
    for (let i = 0; i < 10; i++) {
      await createTask("agent-1", `task-${i}`)
    }

    // Start first drain
    const req1 = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
    })
    const context1 = await mockContext({ id: "agent-1" })
    const promise1 = drainPost(req1, context1)

    // Immediately try second drain
    const req2 = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
    })
    const context2 = await mockContext({ id: "agent-1" })
    const response2 = await drainPost(req2, context2)
    const data2 = await response2.json()

    expect(response2.status).toBe(409)
    expect(data2.ok).toBe(false)
    expect(data2.error).toContain("already in progress")

    // Wait for first drain to complete
    await promise1
  })

  it("isolates drain between agents", async () => {
    await createTask("agent-1", "task-a")
    await createTask("agent-2", "task-b")

    const req1 = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
    })
    const context1 = await mockContext({ id: "agent-1" })
    const response1 = await drainPost(req1, context1)
    const data1 = await response1.json()

    const req2 = new Request("http://localhost/api/agents/agent-2/tasks/drain", {
      method: "POST",
    })
    const context2 = await mockContext({ id: "agent-2" })
    const response2 = await drainPost(req2, context2)
    const data2 = await response2.json()

    expect(data1.processed).toBe(1)
    expect(data2.processed).toBe(1)
  })
})

describe("DELETE /api/agents/:id/tasks", () => {
  beforeEach(() => {
    resetTaskQueue()
  })

  it("purges all pending tasks", async () => {
    await createTask("agent-1", "payment")
    await createTask("agent-1", "indexing")
    await createTask("agent-1", "verification")

    const req = new Request("http://localhost/api/agents/agent-1/tasks", {
      method: "DELETE",
    })
    const context = await mockContext({ id: "agent-1" })
    const response = await purgeDel(req, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.purged).toBe(3)
  })

  it("returns 0 when queue is empty", async () => {
    const req = new Request("http://localhost/api/agents/agent-1/tasks", {
      method: "DELETE",
    })
    const context = await mockContext({ id: "agent-1" })
    const response = await purgeDel(req, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.purged).toBe(0)
  })

  it("isolates purge between agents", async () => {
    await createTask("agent-1", "task-a")
    await createTask("agent-1", "task-b")
    await createTask("agent-2", "task-c")

    const req = new Request("http://localhost/api/agents/agent-1/tasks", {
      method: "DELETE",
    })
    const context = await mockContext({ id: "agent-1" })
    const response = await purgeDel(req, context)
    const data = await response.json()

    expect(data.purged).toBe(2)

    // Verify agent-2 tasks remain
    const req2 = new Request("http://localhost/api/agents/agent-2/tasks/drain", {
      method: "POST",
    })
    const context2 = await mockContext({ id: "agent-2" })
    const response2 = await drainPost(req2, context2)
    const data2 = await response2.json()

    expect(data2.processed).toBe(1)
  })
})

describe("drain + purge integration", () => {
  beforeEach(() => {
    resetTaskQueue()
  })

  it("purge after partial drain", async () => {
    for (let i = 0; i < 20; i++) {
      await createTask("agent-1", `task-${i}`)
    }

    // Drain 10
    const drainReq = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxItems: 10 }),
    })
    const drainContext = await mockContext({ id: "agent-1" })
    const drainRes = await drainPost(drainReq, drainContext)
    const drainData = await drainRes.json()
    expect(drainData.processed).toBe(10)

    // Purge remaining
    const purgeReq = new Request("http://localhost/api/agents/agent-1/tasks", {
      method: "DELETE",
    })
    const purgeContext = await mockContext({ id: "agent-1" })
    const purgeRes = await purgeDel(purgeReq, purgeContext)
    const purgeData = await purgeRes.json()
    expect(purgeData.purged).toBe(10)
  })

  it("drain after purge returns empty", async () => {
    await createTask("agent-1", "task-a")
    await createTask("agent-1", "task-b")

    // Purge all
    const purgeReq = new Request("http://localhost/api/agents/agent-1/tasks", {
      method: "DELETE",
    })
    const purgeContext = await mockContext({ id: "agent-1" })
    await purgeDel(purgeReq, purgeContext)

    // Try drain
    const drainReq = new Request("http://localhost/api/agents/agent-1/tasks/drain", {
      method: "POST",
    })
    const drainContext = await mockContext({ id: "agent-1" })
    const drainRes = await drainPost(drainReq, drainContext)
    const drainData = await drainRes.json()
    expect(drainData.processed).toBe(0)
  })
})
