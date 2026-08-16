import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init?: ResponseInit) => {
      return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json", ...init?.headers },
      })
    },
  },
}))

import {
  enqueueTask,
  dequeue,
  peekNext,
  failTask,
  retryAll,
  resetTaskQueueForTests,
  getTask,
} from "@/lib/agent-runtime/task-queue"
import { POST } from "@/app/api/tasks/route"
import { GET } from "@/app/api/tasks/[id]/route"

describe("Task Queue", () => {
  beforeEach(() => {
    resetTaskQueueForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("Tasks are dequeued in descending priority order (high priority before low)", () => {
    enqueueTask({ type: "low_task", priority: "low" })
    enqueueTask({ type: "critical_task", priority: "critical" })
    enqueueTask({ type: "high_task", priority: "high" })
    enqueueTask({ type: "normal_task", priority: "normal" })

    expect(dequeue()?.type).toBe("critical_task")
    expect(dequeue()?.type).toBe("high_task")
    expect(dequeue()?.type).toBe("normal_task")
    expect(dequeue()?.type).toBe("low_task")
  })

  it("enqueue() with equal priorities uses FIFO ordering", () => {
    enqueueTask({ type: "task1", priority: "normal" })
    
    vi.advanceTimersByTime(100)
    enqueueTask({ type: "task2", priority: "normal" })
    
    vi.advanceTimersByTime(100)
    enqueueTask({ type: "task3", priority: "normal" })

    expect(dequeue()?.type).toBe("task1")
    expect(dequeue()?.type).toBe("task2")
    expect(dequeue()?.type).toBe("task3")
  })

  it("A task that fails N times moves to the dead-letter queue", () => {
    const task = enqueueTask({ type: "fail_task", maxRetries: 2 })
    
    failTask(task.id, "error 1")
    let updatedTask = getTask(task.id)
    expect(updatedTask?.status).toBe("pending")
    expect(updatedTask?.retryCount).toBe(1)
    
    failTask(task.id, "error 2")
    updatedTask = getTask(task.id)
    expect(updatedTask?.status).toBe("pending")
    expect(updatedTask?.retryCount).toBe(2)
    
    failTask(task.id, "error 3")
    updatedTask = getTask(task.id)
    expect(updatedTask?.status).toBe("dead-letter")
  })

  it("retryAll() moves dead-letter tasks back to the main queue", () => {
    const task1 = enqueueTask({ type: "task1", maxRetries: 0 })
    vi.advanceTimersByTime(100)
    const task2 = enqueueTask({ type: "task2", maxRetries: 0 })

    failTask(task1.id, "err")
    failTask(task2.id, "err")

    expect(getTask(task1.id)?.status).toBe("dead-letter")
    expect(getTask(task2.id)?.status).toBe("dead-letter")

    const count = retryAll()
    expect(count).toBe(2)

    expect(getTask(task1.id)?.status).toBe("pending")
    expect(getTask(task2.id)?.status).toBe("pending")
  })

  it("peekNext() returns the highest-priority item without dequeuing", () => {
    enqueueTask({ type: "low_task", priority: "low" })
    enqueueTask({ type: "high_task", priority: "high" })

    const peeked = peekNext()
    expect(peeked?.type).toBe("high_task")

    // The task should still be pending and peekable again
    const peeked2 = peekNext()
    expect(peeked2?.type).toBe("high_task")
    expect(peeked2?.status).toBe("pending")
  })

  it("Empty queue returns null from dequeue()", () => {
    expect(dequeue()).toBeNull()
  })

  it("POST /api/tasks returns 201 with the created task ID", async () => {
    const req = new Request("http://localhost/api/tasks", {
      method: "POST",
      body: JSON.stringify({ type: "api_task", priority: "high" }),
      headers: { "Content-Type": "application/json" },
    })
    
    const res = await POST(req)
    expect(res.status).toBe(201)
    
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.task).toBeDefined()
    expect(body.task.id).toBeDefined()
    expect(body.task.type).toBe("api_task")
    expect(body.task.priority).toBe("high")
  })

  it("GET /api/tasks/[id] returns the task status correctly", async () => {
    const task = enqueueTask({ type: "get_task", priority: "normal" })

    const req = new Request(`http://localhost/api/tasks/${task.id}`)
    
    const res = await GET(req, { params: Promise.resolve({ id: task.id }) })
    
    expect(res.status).toBe(200)
    const body = await res.json()
    
    expect(body.ok).toBe(true)
    expect(body.task.id).toBe(task.id)
    expect(body.task.status).toBe("pending")
  })
})
