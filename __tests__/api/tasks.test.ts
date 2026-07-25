import { beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DELETE as discardDeadLetterTask } from "@/app/api/tasks/dead-letter/[id]/route"
import { POST as retryDeadLetterTask } from "@/app/api/tasks/dead-letter/[id]/retry/route"
import { GET as listDeadLetterTasks } from "@/app/api/tasks/dead-letter/route"
import { GET as getTask } from "@/app/api/tasks/[id]/route"
import { POST as cancelTask } from "@/app/api/tasks/[id]/cancel/route"
import { POST as failTask } from "@/app/api/tasks/[id]/fail/route"
import { POST as retryTask } from "@/app/api/tasks/[id]/retry/route"
import { GET as listTasks, POST as enqueueTask } from "@/app/api/tasks/route"
import { loadDeadLetterQueueForTests, resetTaskQueueForTests } from "@/lib/agent-runtime/task-queue"

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe("/api/tasks", () => {
  beforeEach(() => {
    const tempDir = mkdtempSync(join(tmpdir(), "open-stellar-task-dlq-"))
    process.env.TASK_DLQ_FILE = join(tempDir, "task-dlq.json")
    resetTaskQueueForTests()
  })

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

  it("persists dead-letter entries and reloads them from file", async () => {
    const createRes = await enqueueTask(new Request("http://localhost/api/tasks", {
      method: "POST",
      body: JSON.stringify({ id: "persisted-task", type: "agent.persist", maxRetries: 0, payload: { sector: "beta" } }),
      headers: { "Content-Type": "application/json" },
    }))
    expect(createRes.status).toBe(201)

    const failRes = await failTask(new Request("http://localhost/api/tasks/persisted-task/fail", {
      method: "POST",
      body: JSON.stringify({ error: "permanent" }),
    }), context("persisted-task"))
    expect(failRes.status).toBe(200)

    const persisted = JSON.parse(readFileSync(process.env.TASK_DLQ_FILE!, "utf8"))
    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toMatchObject({
      task: { id: "persisted-task", status: "dead-letter" },
      errorMessage: "permanent",
      retryCount: 0,
    })

    resetTaskQueueForTests()
    loadDeadLetterQueueForTests()
    const listRes = await listDeadLetterTasks(new Request("http://localhost/api/tasks/dead-letter"))
    const list = await listRes.json()
    expect(list.tasks[0].task.id).toBe("persisted-task")
  })

  it("lists, retries, and discards dead-letter tasks via dedicated endpoints", async () => {
    for (const id of ["dlq-1", "dlq-2"]) {
      await enqueueTask(new Request("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ id, type: "agent.dead", maxRetries: 0 }),
        headers: { "Content-Type": "application/json" },
      }))
      await failTask(new Request(`http://localhost/api/tasks/${id}/fail`, {
        method: "POST",
        body: JSON.stringify({ error: `${id} failed` }),
      }), context(id))
    }

    const listRes = await listDeadLetterTasks(new Request("http://localhost/api/tasks/dead-letter?limit=1&offset=1"))
    const list = await listRes.json()
    expect(listRes.status).toBe(200)
    expect(list.tasks).toHaveLength(1)
    expect(list.pagination.total).toBe(2)
    expect(list.tasks[0]).toMatchObject({ errorMessage: "dlq-2 failed", retryCount: 0 })

    const retryRes = await retryDeadLetterTask(new Request("http://localhost/api/tasks/dead-letter/dlq-1/retry", { method: "POST" }), context("dlq-1"))
    const retried = await retryRes.json()
    expect(retryRes.status).toBe(200)
    expect(retried.task.status).toBe("pending")

    const discardRes = await discardDeadLetterTask(new Request("http://localhost/api/tasks/dead-letter/dlq-2", { method: "DELETE" }), context("dlq-2"))
    const discarded = await discardRes.json()
    expect(discardRes.status).toBe(200)
    expect(discarded.task.status).toBe("dead-letter")

    const notFoundRes = await discardDeadLetterTask(new Request("http://localhost/api/tasks/dead-letter/missing", { method: "DELETE" }), context("missing"))
    expect(notFoundRes.status).toBe(404)
  })
})
