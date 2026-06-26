import { beforeEach, describe, expect, it } from "vitest"
import { GET as getTask } from "@/app/api/tasks/[id]/route"
import { POST as cancelTask } from "@/app/api/tasks/[id]/cancel/route"
import { POST as failTask } from "@/app/api/tasks/[id]/fail/route"
import { POST as retryTask } from "@/app/api/tasks/[id]/retry/route"
import { GET as listTasks, POST as enqueueTask } from "@/app/api/tasks/route"
import { resetTaskQueueForTests } from "@/lib/agent-runtime/task-queue"

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe("/api/tasks", () => {
  beforeEach(() => resetTaskQueueForTests())

  it("enqueues and retrieves a prioritized task", async () => {
    const createRes = await enqueueTask(new Request("http://localhost/api/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "agent.scan", priority: "high", targetAgentId: "bot-2", payload: { sector: "alpha" } }),
      headers: { "Content-Type": "application/json" },
    }))
    const created = await createRes.json()

    expect(createRes.status).toBe(201)
    expect(created.task.priority).toBe("high")

    const readRes = await getTask(new Request(`http://localhost/api/tasks/${created.task.id}`), context(created.task.id))
    const read = await readRes.json()
    expect(read.task.payload).toEqual({ sector: "alpha" })
  })

  it("lists tasks for an agent in priority order", async () => {
    for (const task of [{ type: "low-work", priority: "low" }, { type: "critical-work", priority: "critical" }]) {
      await enqueueTask(new Request("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ ...task, targetAgentId: "bot-1" }),
        headers: { "Content-Type": "application/json" },
      }))
    }

    const res = await listTasks(new Request("http://localhost/api/tasks?agent=bot-1"))
    const data = await res.json()
    expect(data.tasks.map((task: { type: string }) => task.type)).toEqual(["critical-work", "low-work"])
  })

  it("cancels pending tasks", async () => {
    const createRes = await enqueueTask(new Request("http://localhost/api/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "agent.cancel" }),
      headers: { "Content-Type": "application/json" },
    }))
    const created = await createRes.json()

    const res = await cancelTask(new Request(`http://localhost/api/tasks/${created.task.id}/cancel`, { method: "POST" }), context(created.task.id))
    const data = await res.json()
    expect(data.task.status).toBe("cancelled")
  })

  it("backs off retries then moves exhausted tasks to dead-letter", async () => {
    const createRes = await enqueueTask(new Request("http://localhost/api/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "agent.retry", maxRetries: 1 }),
      headers: { "Content-Type": "application/json" },
    }))
    const created = await createRes.json()

    const firstFail = await failTask(new Request(`http://localhost/api/tasks/${created.task.id}/fail`, {
      method: "POST",
      body: JSON.stringify({ error: "temporary" }),
    }), context(created.task.id))
    const retried = await firstFail.json()
    expect(retried.task.status).toBe("pending")
    expect(retried.task.retryCount).toBe(1)
    expect(Date.parse(retried.task.scheduledFor)).toBeGreaterThan(Date.now())

    const secondFail = await failTask(new Request(`http://localhost/api/tasks/${created.task.id}/fail`, {
      method: "POST",
      body: JSON.stringify({ error: "permanent" }),
    }), context(created.task.id))
    const dead = await secondFail.json()
    expect(dead.task.status).toBe("dead-letter")

    const retryRes = await retryTask(new Request(`http://localhost/api/tasks/${created.task.id}/retry`, { method: "POST" }), context(created.task.id))
    const retry = await retryRes.json()
    expect(retry.task.status).toBe("pending")
    expect(retry.task.retryCount).toBe(0)
  })
})
