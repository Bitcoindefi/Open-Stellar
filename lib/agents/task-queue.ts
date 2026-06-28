import type { AgentTask } from "@/lib/types"

export const TASK_TIMEOUT_MS = 5 * 60 * 1000
export const MAX_PENDING_PER_AGENT = 250

export type TaskStatus = AgentTask["status"]

export interface CreateTaskInput {
  type: string
  payload: unknown
}

export interface UpdateTaskInput {
  status: "completed" | "failed"
  result?: unknown
}

interface TaskQueueDb {
  tasks: Map<string, AgentTask>
  agentQueues: Map<string, string[]> // agentId -> ordered taskIds
}

const globalQueue = globalThis as typeof globalThis & {
  __openStellarTaskQueueDb__?: TaskQueueDb
}

function getDb(): TaskQueueDb {
  if (!globalQueue.__openStellarTaskQueueDb__) {
    globalQueue.__openStellarTaskQueueDb__ = {
      tasks: new Map(),
      agentQueues: new Map(),
    }
  }
  return globalQueue.__openStellarTaskQueueDb__
}

function normalizeAgentId(agentId: string): string {
  const trimmed = agentId.trim()
  if (!trimmed) throw new Error("agentId must not be empty")
  return trimmed.slice(0, 200)
}

function normalizeType(type: unknown): string {
  const t = String(type).trim()
  if (!t) throw new Error("task type must not be empty")
  return t.slice(0, 100)
}

function getPendingCount(agentId: string): number {
  const db = getDb()
  const queue = db.agentQueues.get(agentId) ?? []
  let count = 0
  for (const taskId of queue) {
    const task = db.tasks.get(taskId)
    if (task && task.status === "pending") count++
  }
  return count
}

function cleanupTimeouts(): void {
  const db = getDb()
  const now = Date.now()
  for (const task of db.tasks.values()) {
    if (task.status === "running" && task.startedAt) {
      if (now - task.startedAt >= TASK_TIMEOUT_MS) {
        task.status = "pending"
        task.startedAt = undefined
      }
    }
  }
}

export function createTask(agentId: string, input: CreateTaskInput): { task: AgentTask; overflow: boolean } {
  const cleanId = normalizeAgentId(agentId)
  const type = normalizeType(input.type)

  cleanupTimeouts()

  const pendingCount = getPendingCount(cleanId)
  if (pendingCount >= MAX_PENDING_PER_AGENT) {
    return { task: null as unknown as AgentTask, overflow: true }
  }

  const task: AgentTask = {
    id: crypto.randomUUID(),
    agentId: cleanId,
    type,
    payload: input.payload,
    status: "pending",
    createdAt: Date.now(),
  }

  const db = getDb()
  db.tasks.set(task.id, task)

  const queue = db.agentQueues.get(cleanId) ?? []
  queue.push(task.id)
  db.agentQueues.set(cleanId, queue)

  return { task, overflow: false }
}

export function dequeueNextTask(agentId: string): AgentTask | null {
  const cleanId = normalizeAgentId(agentId)
  cleanupTimeouts()

  const db = getDb()
  const queue = db.agentQueues.get(cleanId) ?? []

  for (const taskId of queue) {
    const task = db.tasks.get(taskId)
    if (!task) continue

    if (task.status === "pending") {
      task.status = "running"
      task.startedAt = Date.now()
      return task
    }
  }

  return null
}

export function updateTask(
  agentId: string,
  taskId: string,
  input: UpdateTaskInput,
): AgentTask | null {
  const cleanId = normalizeAgentId(agentId)
  const db = getDb()
  const task = db.tasks.get(taskId)

  if (!task || task.agentId !== cleanId) return null
  if (task.status !== "running") return null

  const newStatus = input.status
  if (newStatus !== "completed" && newStatus !== "failed") {
    throw new Error("status must be 'completed' or 'failed'")
  }

  task.status = newStatus
  task.completedAt = Date.now()

  return task
}

export function getTask(agentId: string, taskId: string): AgentTask | null {
  const cleanId = normalizeAgentId(agentId)
  const db = getDb()
  const task = db.tasks.get(taskId)
  if (!task || task.agentId !== cleanId) return null
  return task
}

export function listAgentTasks(agentId: string): AgentTask[] {
  const cleanId = normalizeAgentId(agentId)
  const db = getDb()
  const queue = db.agentQueues.get(cleanId) ?? []
  const tasks: AgentTask[] = []
  for (const taskId of queue) {
    const task = db.tasks.get(taskId)
    if (task) tasks.push(task)
  }
  return tasks
}

export function resetTaskQueue(): void {
  const db = getDb()
  db.tasks.clear()
  db.agentQueues.clear()
}

export function getQueueStats(): {
  totalTasks: number
  totalAgents: number
  pendingTasks: number
  runningTasks: number
  completedTasks: number
  failedTasks: number
} {
  const db = getDb()
  cleanupTimeouts()

  let pending = 0
  let running = 0
  let completed = 0
  let failed = 0

  for (const task of db.tasks.values()) {
    if (task.status === "pending") pending++
    else if (task.status === "running") running++
    else if (task.status === "completed") completed++
    else if (task.status === "failed") failed++
  }

  return {
    totalTasks: db.tasks.size,
    totalAgents: db.agentQueues.size,
    pendingTasks: pending,
    runningTasks: running,
    completedTasks: completed,
    failedTasks: failed,
  }
}

// Track agents currently draining to prevent concurrent drains
const drainingAgents = new Set<string>()

export interface DrainResult {
  processed: number
  skipped: number
  errors: Array<{ taskId: string; error: string }>
  durationMs: number
}

export interface DrainOptions {
  maxItems?: number
  processor?: (task: AgentTask) => Promise<void>
}

const MAX_DRAIN_ITEMS = 200
const DEFAULT_DRAIN_ITEMS = 50

export async function drainAgentTasks(
  agentId: string,
  options: DrainOptions = {},
): Promise<{ result: DrainResult | null; alreadyDraining: boolean }> {
  const cleanId = normalizeAgentId(agentId)

  // Check if drain already in progress
  if (drainingAgents.has(cleanId)) {
    return { result: null, alreadyDraining: true }
  }

  drainingAgents.add(cleanId)

  try {
    const startTime = Date.now()
    const maxItems = Math.min(
      Math.max(1, options.maxItems ?? DEFAULT_DRAIN_ITEMS),
      MAX_DRAIN_ITEMS,
    )

    const result: DrainResult = {
      processed: 0,
      skipped: 0,
      errors: [],
      durationMs: 0,
    }

    cleanupTimeouts()

    // Process tasks in FIFO order up to maxItems
    for (let i = 0; i < maxItems; i++) {
      const task = dequeueNextTask(cleanId)

      if (!task) {
        // No more pending tasks
        break
      }

      try {
        // Call processor if provided (for testing/custom logic)
        if (options.processor) {
          await options.processor(task)
        }

        // Mark as completed
        updateTask(cleanId, task.id, { status: "completed" })
        result.processed++
      } catch (error) {
        // Mark as failed and record error
        updateTask(cleanId, task.id, { status: "failed" })
        result.errors.push({
          taskId: task.id,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    result.durationMs = Date.now() - startTime

    return { result, alreadyDraining: false }
  } finally {
    drainingAgents.delete(cleanId)
  }
}

export function purgeAgentTasks(agentId: string): number {
  const cleanId = normalizeAgentId(agentId)
  const db = getDb()
  const queue = db.agentQueues.get(cleanId) ?? []

  let purged = 0

  // Remove all pending tasks
  for (const taskId of queue) {
    const task = db.tasks.get(taskId)
    if (task && task.status === "pending") {
      db.tasks.delete(taskId)
      purged++
    }
  }

  // Update the queue to only include non-pending tasks
  const remainingTasks = queue.filter((taskId) => {
    const task = db.tasks.get(taskId)
    return task && task.status !== "pending"
  })

  if (remainingTasks.length === 0) {
    db.agentQueues.delete(cleanId)
  } else {
    db.agentQueues.set(cleanId, remainingTasks)
  }

  return purged
}