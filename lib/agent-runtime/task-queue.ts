import { DISTRICTS } from "@/lib/data"
import type { DistrictId } from "@/lib/types"
import { consumeHighPrioritySlotOrDowngrade } from "@/lib/agents/high-priority-rate-limit-store"


export type QueuedTaskPriority = "critical" | "high" | "normal" | "low"
export type QueuedTaskStatus = "pending" | "leased" | "completed" | "failed" | "cancelled" | "dead-letter"

export interface QueuedTask {
  id: string
  type: string
  payload: Record<string, unknown>
  priority: QueuedTaskPriority
  targetAgentId?: string
  targetDistrict?: DistrictId
  targetCapability?: string
  retryCount: number
  maxRetries: number
  createdAt: string
  scheduledFor?: string
  status: QueuedTaskStatus
  result?: unknown
  error?: string
  updatedAt: string
  deadLetteredAt?: string
}

export interface EnqueueTaskInput {
  id?: string
  type: string
  payload?: Record<string, unknown>
  priority?: QueuedTaskPriority
  targetAgentId?: string
  targetDistrict?: DistrictId
  targetCapability?: string
  maxRetries?: number
  scheduledFor?: string
}

interface TaskQueueState {
  tasks: Map<string, QueuedTask>
  sequence: number
}

const globalState = globalThis as typeof globalThis & {
  __openStellarTaskQueue__?: TaskQueueState
}

const queueState: TaskQueueState = globalState.__openStellarTaskQueue__ ?? {
  tasks: new Map(),
  sequence: 0,
}

if (!globalState.__openStellarTaskQueue__) {
  globalState.__openStellarTaskQueue__ = queueState
}

const PRIORITY_WEIGHT: Record<QueuedTaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}

const RETRY_BACKOFF_SECONDS = [5, 15, 45, 135] as const

function nextTaskId(): string {
  queueState.sequence += 1
  return `task_${Date.now()}_${queueState.sequence}`
}

export function resetTaskQueueForTests(): void {
  queueState.tasks.clear()
  queueState.sequence = 0
}

export function isQueuedTaskPriority(value: unknown): value is QueuedTaskPriority {
  return value === "critical" || value === "high" || value === "normal" || value === "low"
}

export function isQueuedTaskStatus(value: unknown): value is QueuedTaskStatus {
  return (
    value === "pending" ||
    value === "leased" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "dead-letter"
  )
}

export function isValidTaskDistrict(value: unknown): value is DistrictId {
  return typeof value === "string" && DISTRICTS.some((district) => district.id === value)
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  return trimmed
}

function normalizeScheduledFor(value: string | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error("scheduledFor must be an ISO date")
  return date.toISOString()
}

export function enqueueTask(input: EnqueueTaskInput): QueuedTask {
  const now = new Date().toISOString()
  const requestedPriority = input.priority ?? "normal"
  if (!isQueuedTaskPriority(requestedPriority)) throw new Error("Unsupported task priority")
  if (input.targetDistrict && !isValidTaskDistrict(input.targetDistrict)) throw new Error("Unsupported target district")

  let priority: QueuedTaskPriority = requestedPriority

  // Per-agent high-priority token bucket limiting to prevent a single agent from starving others.
  // When a client attempts to enqueue more high-priority tasks than allowed in the current 60s window,
  // the task is automatically downgraded.
  if (requestedPriority === "high" && input.targetAgentId) {
    const { priorityAllowed, usedInWindow, limit, resetsAt } = consumeHighPrioritySlotOrDowngrade(input.targetAgentId)
    if (!priorityAllowed) {
      // Downgrade high -> normal ("medium" in spec maps to the existing "normal" level).
      priority = "normal"
      console.warn(
        `[Open Stellar] Downgraded high-priority task enqueue from agent=${input.targetAgentId}; ` +
          `high-priority limit=${limit}/min exceeded (used=${usedInWindow}, resetsAt=${resetsAt}).`,
      )
    }
  }


  const task: QueuedTask = {
    id: input.id?.trim() || nextTaskId(),
    type: assertNonEmpty(input.type, "type"),
    payload: input.payload ?? {},
    priority,
    targetAgentId: input.targetAgentId?.trim() || undefined,
    targetDistrict: input.targetDistrict,
    targetCapability: input.targetCapability?.trim() || undefined,
    retryCount: 0,
    maxRetries: Math.max(0, Math.floor(input.maxRetries ?? RETRY_BACKOFF_SECONDS.length)),
    createdAt: now,
    scheduledFor: normalizeScheduledFor(input.scheduledFor),
    status: "pending",
    updatedAt: now,
  }

  if (queueState.tasks.has(task.id)) throw new Error("Task id already exists")
  queueState.tasks.set(task.id, task)
  return task
}

export function getTask(id: string): QueuedTask | undefined {
  return queueState.tasks.get(id)
}

function taskSortKey(task: QueuedTask): [number, number, number] {
  return [
    PRIORITY_WEIGHT[task.priority],
    Date.parse(task.scheduledFor ?? task.createdAt),
    Date.parse(task.createdAt),
  ]
}

function sortTasks(a: QueuedTask, b: QueuedTask): number {
  const left = taskSortKey(a)
  const right = taskSortKey(b)
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return a.id.localeCompare(b.id)
}

export function listTasks(filters: { agentId?: string; status?: QueuedTaskStatus; includeDeadLetter?: boolean } = {}): QueuedTask[] {
  const now = Date.now()
  return [...queueState.tasks.values()]
    .filter((task) => (filters.status ? task.status === filters.status : filters.includeDeadLetter || task.status !== "dead-letter"))
    .filter((task) => !filters.agentId || task.targetAgentId === filters.agentId)
    .filter((task) => task.status !== "pending" || !task.scheduledFor || Date.parse(task.scheduledFor) <= now || !filters.agentId)
    .sort(sortTasks)
}

export function listDeadLetterTasks(): QueuedTask[] {
  return listTasks({ status: "dead-letter", includeDeadLetter: true })
}

export function cancelTask(id: string): QueuedTask {
  const task = queueState.tasks.get(id)
  if (!task) throw new Error("Task not found")
  if (task.status !== "pending") throw new Error("Only pending tasks can be cancelled")
  const updated = { ...task, status: "cancelled" as const, updatedAt: new Date().toISOString() }
  queueState.tasks.set(id, updated)
  return updated
}

export function failTask(id: string, error: string): QueuedTask {
  const task = queueState.tasks.get(id)
  if (!task) throw new Error("Task not found")
  const now = new Date()
  if (task.retryCount >= task.maxRetries) {
    const dead = { ...task, status: "dead-letter" as const, error, updatedAt: now.toISOString(), deadLetteredAt: now.toISOString() }
    queueState.tasks.set(id, dead)
    return dead
  }
  const backoffSeconds = RETRY_BACKOFF_SECONDS[Math.min(task.retryCount, RETRY_BACKOFF_SECONDS.length - 1)]
  const retry = {
    ...task,
    status: "pending" as const,
    retryCount: task.retryCount + 1,
    error,
    scheduledFor: new Date(now.getTime() + backoffSeconds * 1000).toISOString(),
    updatedAt: now.toISOString(),
  }
  queueState.tasks.set(id, retry)
  return retry
}

export function retryDeadLetterTask(id: string): QueuedTask {
  const task = queueState.tasks.get(id)
  if (!task) throw new Error("Task not found")
  if (task.status !== "dead-letter") throw new Error("Only dead-letter tasks can be retried")
  const retry = {
    ...task,
    status: "pending" as const,
    retryCount: 0,
    scheduledFor: undefined,
    deadLetteredAt: undefined,
    updatedAt: new Date().toISOString(),
  }
  queueState.tasks.set(id, retry)
  return retry
}
