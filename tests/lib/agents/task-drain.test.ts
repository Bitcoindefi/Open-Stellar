import { describe, it, expect, beforeEach } from "vitest"
import {
  createTask,
  drainAgentTasks,
  purgeAgentTasks,
  resetTaskQueue,
  listAgentTasks,
  getQueueStats,
} from "@/lib/agents/task-queue"

describe("task-queue drain and purge", () => {
  beforeEach(() => {
    resetTaskQueue()
  })

  describe("drainAgentTasks", () => {
    it("processes tasks in FIFO order", async () => {
      createTask("agent-1", { type: "a", payload: {} })
      createTask("agent-1", { type: "b", payload: {} })
      createTask("agent-1", { type: "c", payload: {} })

      const processedTasks: string[] = []
      const { result } = await drainAgentTasks("agent-1", {
        processor: async (task) => {
          processedTasks.push(task.type)
        },
      })

      expect(result).not.toBeNull()
      expect(result!.processed).toBe(3)
      expect(result!.skipped).toBe(0)
      expect(result!.errors).toHaveLength(0)
      expect(result!.durationMs).toBeGreaterThanOrEqual(0)
      expect(processedTasks).toEqual(["a", "b", "c"])

      const stats = getQueueStats()
      expect(stats.pendingTasks).toBe(0)
      expect(stats.completedTasks).toBe(3)
    })

    it("returns empty result when queue is empty", async () => {
      const { result } = await drainAgentTasks("agent-1")

      expect(result).not.toBeNull()
      expect(result!.processed).toBe(0)
      expect(result!.skipped).toBe(0)
      expect(result!.errors).toHaveLength(0)
    })

    it("respects maxItems limit", async () => {
      for (let i = 0; i < 10; i++) {
        createTask("agent-1", { type: `task-${i}`, payload: {} })
      }

      const { result } = await drainAgentTasks("agent-1", { maxItems: 5 })

      expect(result).not.toBeNull()
      expect(result!.processed).toBe(5)

      const stats = getQueueStats()
      expect(stats.pendingTasks).toBe(5)
      expect(stats.completedTasks).toBe(5)
    })

    it("caps maxItems at 200", async () => {
      // Create 250 tasks
      for (let i = 0; i < 250; i++) {
        createTask("agent-1", { type: `task-${i}`, payload: {} })
      }

      const { result } = await drainAgentTasks("agent-1", { maxItems: 300 })

      expect(result).not.toBeNull()
      // Should only process 200 (the cap)
      expect(result!.processed).toBe(200)

      const stats = getQueueStats()
      expect(stats.pendingTasks).toBe(50)
      expect(stats.completedTasks).toBe(200)
    })

    it("uses default maxItems of 50", async () => {
      for (let i = 0; i < 100; i++) {
        createTask("agent-1", { type: `task-${i}`, payload: {} })
      }

      const { result } = await drainAgentTasks("agent-1")

      expect(result).not.toBeNull()
      expect(result!.processed).toBe(50)

      const stats = getQueueStats()
      expect(stats.pendingTasks).toBe(50)
      expect(stats.completedTasks).toBe(50)
    })

    it("handles processor errors gracefully", async () => {
      createTask("agent-1", { type: "success", payload: {} })
      createTask("agent-1", { type: "fail", payload: {} })
      createTask("agent-1", { type: "success", payload: {} })

      const { result } = await drainAgentTasks("agent-1", {
        processor: async (task) => {
          if (task.type === "fail") {
            throw new Error("Processing failed")
          }
        },
      })

      expect(result).not.toBeNull()
      expect(result!.processed).toBe(2) // Two successful
      expect(result!.errors).toHaveLength(1)
      expect(result!.errors[0].error).toBe("Processing failed")

      const stats = getQueueStats()
      expect(stats.completedTasks).toBe(2)
      expect(stats.failedTasks).toBe(1)
    })

    it("returns 409 on concurrent drain attempts", async () => {
      for (let i = 0; i < 10; i++) {
        createTask("agent-1", { type: `task-${i}`, payload: {} })
      }

      // Start first drain with a slow processor in background
      const firstDrainPromise = drainAgentTasks("agent-1", {
        processor: async () => {
          // Simulate slow processing
          await new Promise((r) => setTimeout(r, 10))
        },
      })

      // Wait a tiny bit for first drain to start
      await new Promise((r) => setTimeout(r, 1))

      // Attempt concurrent drain - should get 409
      const { result: result2, alreadyDraining } = await drainAgentTasks("agent-1")

      expect(alreadyDraining).toBe(true)
      expect(result2).toBeNull()

      // Wait for first drain to complete
      await firstDrainPromise
    })

    it("allows drain after previous drain completes", async () => {
      for (let i = 0; i < 10; i++) {
        createTask("agent-1", { type: `task-${i}`, payload: {} })
      }

      const { result: result1, alreadyDraining: drain1 } = await drainAgentTasks("agent-1", {
        maxItems: 5,
      })
      expect(drain1).toBe(false)
      expect(result1!.processed).toBe(5)

      const { result: result2, alreadyDraining: drain2 } = await drainAgentTasks("agent-1", {
        maxItems: 5,
      })
      expect(drain2).toBe(false)
      expect(result2!.processed).toBe(5)
    })

    it("isolates drain between different agents", async () => {
      createTask("agent-1", { type: "a", payload: {} })
      createTask("agent-2", { type: "b", payload: {} })

      const { result: result1 } = await drainAgentTasks("agent-1")
      const { result: result2 } = await drainAgentTasks("agent-2")

      expect(result1!.processed).toBe(1)
      expect(result2!.processed).toBe(1)

      const stats = getQueueStats()
      expect(stats.completedTasks).toBe(2)
    })

    it("records accurate durationMs", async () => {
      createTask("agent-1", { type: "task", payload: {} })

      const { result } = await drainAgentTasks("agent-1", {
        processor: async () => {
          await new Promise((r) => setTimeout(r, 10))
        },
      })

      expect(result).not.toBeNull()
      expect(result!.durationMs).toBeGreaterThanOrEqual(10)
    })
  })

  describe("purgeAgentTasks", () => {
    it("purges all pending tasks", () => {
      createTask("agent-1", { type: "a", payload: {} })
      createTask("agent-1", { type: "b", payload: {} })
      createTask("agent-1", { type: "c", payload: {} })

      const purged = purgeAgentTasks("agent-1")

      expect(purged).toBe(3)

      const stats = getQueueStats()
      expect(stats.pendingTasks).toBe(0)
      expect(stats.totalTasks).toBe(0)
    })

    it("returns 0 when queue is empty", () => {
      const purged = purgeAgentTasks("agent-1")
      expect(purged).toBe(0)
    })

    it("does not purge running tasks", async () => {
      createTask("agent-1", { type: "a", payload: {} })
      createTask("agent-1", { type: "b", payload: {} })

      // Start processing first task (it will be running)
      const { result } = await drainAgentTasks("agent-1", {
        maxItems: 1,
        processor: async (task) => {
          // First task is now running, then completed
        },
      })
      expect(result!.processed).toBe(1)

      const purged = purgeAgentTasks("agent-1")

      // Should only purge the one pending task
      expect(purged).toBe(1)

      const tasks = listAgentTasks("agent-1")
      // Should have 1 completed task remaining
      expect(tasks.filter((t) => t.status === "completed")).toHaveLength(1)
    })

    it("isolates purge between agents", () => {
      createTask("agent-1", { type: "a", payload: {} })
      createTask("agent-1", { type: "b", payload: {} })
      createTask("agent-2", { type: "c", payload: {} })

      const purged = purgeAgentTasks("agent-1")

      expect(purged).toBe(2)

      const stats = getQueueStats()
      expect(stats.pendingTasks).toBe(1) // agent-2 task remains
    })

    it("removes agent from queue map when all tasks purged", () => {
      createTask("agent-1", { type: "a", payload: {} })
      createTask("agent-1", { type: "b", payload: {} })

      purgeAgentTasks("agent-1")

      const stats = getQueueStats()
      expect(stats.totalAgents).toBe(0)
    })

    it("handles partial purge correctly", async () => {
      createTask("agent-1", { type: "a", payload: {} })
      createTask("agent-1", { type: "b", payload: {} })

      // Process first task to completion
      await drainAgentTasks("agent-1", { maxItems: 1 })

      const purged = purgeAgentTasks("agent-1")

      expect(purged).toBe(1) // Only the pending task

      const tasks = listAgentTasks("agent-1")
      expect(tasks).toHaveLength(1)
      expect(tasks[0].status).toBe("completed")
    })
  })

  describe("drain + purge integration", () => {
    it("purge after partial drain", async () => {
      for (let i = 0; i < 20; i++) {
        createTask("agent-1", { type: `task-${i}`, payload: {} })
      }

      // Drain 10
      const { result } = await drainAgentTasks("agent-1", { maxItems: 10 })
      expect(result!.processed).toBe(10)

      // Purge remaining 10
      const purged = purgeAgentTasks("agent-1")
      expect(purged).toBe(10)

      const stats = getQueueStats()
      expect(stats.pendingTasks).toBe(0)
      expect(stats.completedTasks).toBe(10)
    })

    it("drain after purge returns empty", async () => {
      createTask("agent-1", { type: "a", payload: {} })
      createTask("agent-1", { type: "b", payload: {} })

      const purged = purgeAgentTasks("agent-1")
      expect(purged).toBe(2)

      const { result } = await drainAgentTasks("agent-1")
      expect(result!.processed).toBe(0)
    })
  })
})
