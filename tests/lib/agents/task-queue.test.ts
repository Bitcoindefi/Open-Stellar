import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  createTask,
  dequeueNextTask,
  updateTask,
  getTask,
  listAgentTasks,
  resetTaskQueue,
  getQueueStats,
  TASK_TIMEOUT_MS,
  MAX_PENDING_PER_AGENT,
} from "@/lib/agents/task-queue"

describe("task-queue", () => {
  beforeEach(() => {
    resetTaskQueue()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── enqueue → dequeue ───────────────────────────────────────────
  it("creates a task and returns it via dequeue", () => {
    const { task, overflow } = createTask("agent-1", { type: "payment", payload: { amount: 100 } })
    expect(overflow).toBe(false)
    expect(task.id).toBeDefined()
    expect(task.status).toBe("pending")

    const next = dequeueNextTask("agent-1")
    expect(next).not.toBeNull()
    expect(next!.id).toBe(task.id)
    expect(next!.status).toBe("running")
    expect(next!.startedAt).toBeDefined()
  })

  it("returns 204 (null) when queue is empty", () => {
    const next = dequeueNextTask("agent-1")
    expect(next).toBeNull()
  })

  it("dequeues tasks in FIFO order", () => {
    const { task: t1 } = createTask("agent-1", { type: "a", payload: {} })
    const { task: t2 } = createTask("agent-1", { type: "b", payload: {} })
    const { task: t3 } = createTask("agent-1", { type: "c", payload: {} })

    expect(dequeueNextTask("agent-1")!.id).toBe(t1.id)
    expect(dequeueNextTask("agent-1")!.id).toBe(t2.id)
    expect(dequeueNextTask("agent-1")!.id).toBe(t3.id)
  })

  // ─── running task blocks second dequeue ────────────────────────────
  it("second GET /next returns 204 while task is running", () => {
    createTask("agent-1", { type: "payment", payload: {} })
    const first = dequeueNextTask("agent-1")
    expect(first).not.toBeNull()

    const second = dequeueNextTask("agent-1")
    expect(second).toBeNull()
  })

  it("allows dequeue after task is completed", () => {
    createTask("agent-1", { type: "payment", payload: {} })
    createTask("agent-1", { type: "indexing", payload: {} })

    const first = dequeueNextTask("agent-1")!
    updateTask("agent-1", first.id, { status: "completed" })

    const second = dequeueNextTask("agent-1")
    expect(second).not.toBeNull()
    expect(second!.type).toBe("indexing")
  })

  it("allows dequeue after task is failed", () => {
    createTask("agent-1", { type: "payment", payload: {} })
    createTask("agent-1", { type: "indexing", payload: {} })

    const first = dequeueNextTask("agent-1")!
    updateTask("agent-1", first.id, { status: "failed" })

    const second = dequeueNextTask("agent-1")
    expect(second).not.toBeNull()
    expect(second!.type).toBe("indexing")
  })

  // ─── timeout → requeue ─────────────────────────────────────────────
  it("reverts running task to pending after 5 minutes", () => {
    const { task } = createTask("agent-1", { type: "payment", payload: {} })
    const dequeued = dequeueNextTask("agent-1")!
    expect(dequeued.status).toBe("running")

    vi.advanceTimersByTime(TASK_TIMEOUT_MS)

    const next = dequeueNextTask("agent-1")
    expect(next).not.toBeNull()
    expect(next!.id).toBe(task.id)
    expect(next!.status).toBe("running")
  })

  it("does not timeout a fresh running task", () => {
    createTask("agent-1", { type: "payment", payload: {} })
    const dequeued = dequeueNextTask("agent-1")!
    expect(dequeued.status).toBe("running")

    vi.advanceTimersByTime(TASK_TIMEOUT_MS - 1)

    const next = dequeueNextTask("agent-1")
    expect(next).toBeNull()
  })

  // ─── overflow → 429 ────────────────────────────────────────────────
  it("returns overflow (429) on 101st pending task", () => {
    for (let i = 0; i < MAX_PENDING_PER_AGENT; i++) {
      const { overflow } = createTask("agent-1", { type: "payment", payload: { i } })
      expect(overflow).toBe(false)
    }

    const { overflow } = createTask("agent-1", { type: "payment", payload: { i: 100 } })
    expect(overflow).toBe(true)
  })

  it("does not count running/completed tasks toward pending limit", () => {
    // Fill to 100 pending
    for (let i = 0; i < MAX_PENDING_PER_AGENT; i++) {
      createTask("agent-1", { type: "payment", payload: { i } })
    }

    // Dequeue one → now 99 pending, 1 running
    const first = dequeueNextTask("agent-1")!

    // Should be able to create one more
    const { overflow } = createTask("agent-1", { type: "payment", payload: {} })
    expect(overflow).toBe(false)

    // Complete the running one
    updateTask("agent-1", first.id, { status: "completed" })

    // Still 100 pending (the new one), so 101st should overflow
    const { overflow: overflow2 } = createTask("agent-1", { type: "payment", payload: {} })
    expect(overflow2).toBe(true)
  })

  // ─── update task ───────────────────────────────────────────────────
  it("updates task status to completed", () => {
    const { task } = createTask("agent-1", { type: "payment", payload: {} })
    dequeueNextTask("agent-1")

    const updated = updateTask("agent-1", task.id, { status: "completed", result: { txHash: "abc" } })
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe("completed")
    expect(updated!.completedAt).toBeDefined()
  })

  it("updates task status to failed", () => {
    const { task } = createTask("agent-1", { type: "payment", payload: {} })
    dequeueNextTask("agent-1")

    const updated = updateTask("agent-1", task.id, { status: "failed" })
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe("failed")
  })

  it("returns null when updating non-existent task", () => {
    const updated = updateTask("agent-1", "non-existent", { status: "completed" })
    expect(updated).toBeNull()
  })

  it("returns null when updating task for wrong agent", () => {
    const { task } = createTask("agent-1", { type: "payment", payload: {} })
    dequeueNextTask("agent-1")

    const updated = updateTask("agent-2", task.id, { status: "completed" })
    expect(updated).toBeNull()
  })

  it("returns null when updating non-running task", () => {
    const { task } = createTask("agent-1", { type: "payment", payload: {} })
    // Never dequeued, so still pending
    const updated = updateTask("agent-1", task.id, { status: "completed" })
    expect(updated).toBeNull()
  })

  it("throws on invalid status update", () => {
    const { task } = createTask("agent-1", { type: "payment", payload: {} })
    dequeueNextTask("agent-1")

    expect(() => updateTask("agent-1", task.id, { status: "pending" as any })).toThrow(
      "status must be 'completed' or 'failed'",
    )
  })

  // ─── getTask / listAgentTasks ──────────────────────────────────────
  it("gets a specific task", () => {
    const { task } = createTask("agent-1", { type: "payment", payload: { x: 1 } })
    const found = getTask("agent-1", task.id)
    expect(found).not.toBeNull()
    expect(found!.type).toBe("payment")
  })

  it("returns null for wrong agent on getTask", () => {
    const { task } = createTask("agent-1", { type: "payment", payload: {} })
    const found = getTask("agent-2", task.id)
    expect(found).toBeNull()
  })

  it("lists all tasks for an agent", () => {
    createTask("agent-1", { type: "a", payload: {} })
    createTask("agent-1", { type: "b", payload: {} })
    createTask("agent-2", { type: "c", payload: {} })

    const tasks = listAgentTasks("agent-1")
    expect(tasks).toHaveLength(2)
    expect(tasks.map((t) => t.type)).toEqual(["a", "b"])
  })

  // ─── queue stats ───────────────────────────────────────────────────
  it("returns accurate queue stats", () => {
    createTask("agent-1", { type: "payment", payload: {} })
    createTask("agent-1", { type: "indexing", payload: {} })
    createTask("agent-2", { type: "verification", payload: {} })

    dequeueNextTask("agent-1")

    const stats = getQueueStats()
    expect(stats.totalTasks).toBe(3)
    expect(stats.totalAgents).toBe(2)
    expect(stats.pendingTasks).toBe(2)
    expect(stats.runningTasks).toBe(1)
    expect(stats.completedTasks).toBe(0)
    expect(stats.failedTasks).toBe(0)
  })

  // ─── agent isolation ─────────────────────────────────────────────────
  it("isolates tasks between agents", () => {
    const { task: t1 } = createTask("agent-a", { type: "payment", payload: {} })
    createTask("agent-b", { type: "indexing", payload: {} })

    const nextA = dequeueNextTask("agent-a")
    expect(nextA!.id).toBe(t1.id)

    const nextB = dequeueNextTask("agent-b")
    expect(nextB!.type).toBe("indexing")
  })

  // ─── edge cases ────────────────────────────────────────────────────
  it("throws on empty agentId", () => {
    expect(() => createTask("", { type: "payment", payload: {} })).toThrow("agentId must not be empty")
  })

  it("throws on empty type", () => {
    expect(() => createTask("agent-1", { type: "", payload: {} })).toThrow("task type must not be empty")
  })

  it("trims and normalizes agentId", () => {
    const { task } = createTask("  agent-1  ", { type: "payment", payload: {} })
    expect(task.agentId).toBe("agent-1")
  })
})
