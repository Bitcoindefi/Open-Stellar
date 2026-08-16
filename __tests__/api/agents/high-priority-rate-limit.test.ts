import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as updateRateLimit } from "@/app/api/admin/agents/[id]/rate-limit/route"
import { GET as getRateLimit } from "@/app/api/agents/[id]/rate-limit/route"
import { GET as getTask } from "@/app/api/tasks/[id]/route"
import { POST as enqueueTask } from "@/app/api/tasks/route"
import { resetTaskQueueForTests } from "@/lib/agent-runtime/task-queue"
import { resetHighPriorityRateLimitStoreForTests } from "@/lib/agent-runtime/high-priority-rate-limit"

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe("Per-agent high-priority task rate limiting", () => {
  beforeEach(() => {
    resetTaskQueueForTests()
    resetHighPriorityRateLimitStoreForTests()
    vi.restoreAllMocks()
  })

  it("burst of 10 high-priority tasks from same agent: 5 stay high + 5 downgraded to medium", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const tasks = []
    for (let i = 1; i <= 10; i++) {
      const res = await enqueueTask(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "agent.work",
            priority: "high",
            targetAgentId: "agent-1",
            payload: { index: i },
          }),
        }),
      )
      const data = await res.json()
      expect(res.status).toBe(201)
      tasks.push(data.task)
    }

    const highPriorityTasks = tasks.filter((t) => t.priority === "high")
    const mediumPriorityTasks = tasks.filter((t) => t.priority === "medium")

    expect(highPriorityTasks).toHaveLength(5)
    expect(mediumPriorityTasks).toHaveLength(5)

    // The first 5 tasks (indices 1..5) stay high
    for (let i = 0; i < 5; i++) {
      expect(tasks[i].priority).toBe("high")
    }

    // The 6th to 10th tasks (indices 6..10) are downgraded to medium
    for (let i = 5; i < 10; i++) {
      expect(tasks[i].priority).toBe("medium")
    }

    // Verify warning log was emitted for each downgrade (5 times)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(5)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("High-priority rate limit exceeded for agent agent-1"),
    )
  })

  it("6th high-priority enqueue from same agent in 60s is downgraded to medium", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    for (let i = 1; i <= 5; i++) {
      const res = await enqueueTask(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: `task-${i}`,
            priority: "high",
            targetAgentId: "agent-2",
          }),
        }),
      )
      const data = await res.json()
      expect(data.task.priority).toBe("high")
    }

    // 6th enqueue
    const res6 = await enqueueTask(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "task-6",
          priority: "high",
          targetAgentId: "agent-2",
        }),
      }),
    )
    const data6 = await res6.json()

    expect(data6.task.priority).toBe("medium")
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("High-priority rate limit exceeded for agent agent-2"),
    )
  })

  it("GET /api/agents/[id]/rate-limit returns current limit and current usage", async () => {
    // Before any tasks
    const initialRes = await getRateLimit(
      new Request("http://localhost/api/agents/agent-3/rate-limit"),
      context("agent-3"),
    )
    const initialData = await initialRes.json()

    expect(initialRes.status).toBe(200)
    expect(initialData.ok).toBe(true)
    expect(initialData.agentId).toBe("agent-3")
    expect(initialData.limit).toBe(5)
    expect(initialData.usage).toBe(0)

    // Enqueue 3 high-priority tasks
    for (let i = 0; i < 3; i++) {
      await enqueueTask(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "work",
            priority: "high",
            targetAgentId: "agent-3",
          }),
        }),
      )
    }

    const updatedRes = await getRateLimit(
      new Request("http://localhost/api/agents/agent-3/rate-limit"),
      context("agent-3"),
    )
    const updatedData = await updatedRes.json()

    expect(updatedRes.status).toBe(200)
    expect(updatedData.ok).toBe(true)
    expect(updatedData.agentId).toBe("agent-3")
    expect(updatedData.limit).toBe(5)
    expect(updatedData.usage).toBe(3)
  })

  it("PATCH /api/admin/agents/[id]/rate-limit updates the limit for a specific agent", async () => {
    // Update limit for agent-4 to 10
    const patchRes = await updateRateLimit(
      new Request("http://localhost/api/admin/agents/agent-4/rate-limit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ highPriorityPerMinute: 10 }),
      }),
      context("agent-4"),
    )
    const patchData = await patchRes.json()

    expect(patchRes.status).toBe(200)
    expect(patchData.ok).toBe(true)
    expect(patchData.agentId).toBe("agent-4")
    expect(patchData.highPriorityPerMinute).toBe(10)
    expect(patchData.limit).toBe(10)

    // Verify GET endpoint reflects new limit
    const getRes = await getRateLimit(
      new Request("http://localhost/api/agents/agent-4/rate-limit"),
      context("agent-4"),
    )
    const getData = await getRes.json()
    expect(getData.limit).toBe(10)

    // Now enqueue 10 high priority tasks, all 10 should stay high because limit is 10
    for (let i = 1; i <= 10; i++) {
      const res = await enqueueTask(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "work",
            priority: "high",
            targetAgentId: "agent-4",
          }),
        }),
      )
      const data = await res.json()
      expect(data.task.priority).toBe("high")
    }

    // 11th task should be downgraded
    const res11 = await enqueueTask(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "work-11",
          priority: "high",
          targetAgentId: "agent-4",
        }),
      }),
    )
    const data11 = await res11.json()
    expect(data11.task.priority).toBe("medium")
  })

  it("Rate limit counter resets every 60s", async () => {
    vi.useFakeTimers()
    const now = Date.now()
    vi.setSystemTime(now)

    // Fill 5 slots
    for (let i = 0; i < 5; i++) {
      await enqueueTask(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "work",
            priority: "high",
            targetAgentId: "agent-5",
          }),
        }),
      )
    }

    // 6th is downgraded
    const res6 = await enqueueTask(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "work",
          priority: "high",
          targetAgentId: "agent-5",
        }),
      }),
    )
    expect((await res6.json()).task.priority).toBe("medium")

    // Advance time by 61 seconds (61,000 ms)
    vi.setSystemTime(now + 61_000)

    // Now a new high priority task should be accepted as high again
    const resAfterReset = await enqueueTask(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "work-after-reset",
          priority: "high",
          targetAgentId: "agent-5",
        }),
      }),
    )
    const dataAfterReset = await resAfterReset.json()
    expect(dataAfterReset.task.priority).toBe("high")

    vi.useRealTimers()
  })

  it("returns 400 for invalid PATCH limit", async () => {
    const res = await updateRateLimit(
      new Request("http://localhost/api/admin/agents/agent-6/rate-limit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ highPriorityPerMinute: -5 }),
      }),
      context("agent-6"),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.ok).toBe(false)
  })
})
