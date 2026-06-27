import { recordAgentHeartbeat } from "@/lib/agents/agent-health-store"
import { sendAgentMessage } from "@/lib/agent-runtime/messaging"
import type { AgentConfig, AgentMetrics, AgentRuntimeContext, AgentMessage, MessageHandler, Task, TaskHandler, TaskResult } from "@/lib/agent-runtime/types"
import { publishSystemEvent } from "@/lib/events/system-events"
import type { AgentStatus } from "@/lib/types"

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000
const DEFAULT_OFFLINE_AFTER_MS = 30_000

interface TaskRecord {
  task: Task
  result: TaskResult | null
  status: "queued" | "running" | "completed" | "failed"
  updatedAt: string
}

interface RuntimeState {
  agents: Map<string, Agent>
  tasks: Map<string, TaskRecord[]>
}

const globalState = globalThis as typeof globalThis & { __openStellarAgentRuntime__?: RuntimeState }
const runtimeState: RuntimeState = globalState.__openStellarAgentRuntime__ ?? { agents: new Map(), tasks: new Map() }
if (!globalState.__openStellarAgentRuntime__) globalState.__openStellarAgentRuntime__ = runtimeState

function isoNow(): string {
  return new Date().toISOString()
}

function normalizeTask(input: unknown): Task {
  const body = typeof input === "object" && input !== null ? input as Record<string, unknown> : {}
  const title = String(body.title || body.description || "Agent task").trim()
  return {
    id: String(body.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    title: title || "Agent task",
    description: body.description ? String(body.description) : undefined,
    payload: body.payload ?? {},
    district: body.district as Task["district"],
    createdAt: body.createdAt ? String(body.createdAt) : isoNow(),
  }
}

function writeTaskRecord(agentId: string, record: TaskRecord): void {
  const records = runtimeState.tasks.get(agentId) ?? []
  const index = records.findIndex((entry) => entry.task.id === record.task.id)
  if (index >= 0) records[index] = record
  else records.unshift(record)
  runtimeState.tasks.set(agentId, records.slice(0, 200))
}

export function listAgentTaskRecords(agentId: string): TaskRecord[] {
  return runtimeState.tasks.get(agentId) ?? []
}

export function getAgentTaskRecord(agentId: string, taskId: string): TaskRecord | null {
  return listAgentTaskRecords(agentId).find((record) => record.task.id === taskId) ?? null
}

export class Agent implements AgentRuntimeContext {
  readonly id: string
  readonly config: AgentConfig
  private status: AgentStatus
  private taskHandlers: TaskHandler[] = []
  private messageHandlers: MessageHandler[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private lastHeartbeatMs: number | null = null
  private startedAtMs: number | null = null
  private stoppedAtMs: number | null = null
  private taskDurations: number[] = []
  private metrics = { tasksCompleted: 0, tasksFailed: 0, messagesSent: 0, messagesReceived: 0 }

  constructor(config: AgentConfig) {
    if (!config.id.trim()) throw new Error("Agent id is required")
    if (!config.name.trim()) throw new Error("Agent name is required")
    this.id = config.id.trim()
    this.config = { ...config, id: this.id }
    this.status = config.status ?? "idle"
    runtimeState.agents.set(this.id, this)
  }

  async start(): Promise<void> {
    this.startedAtMs = this.startedAtMs ?? Date.now()
    this.stoppedAtMs = null
    this.status = "active"
    this.recordHeartbeat()
    this.heartbeatTimer ??= setInterval(() => this.recordHeartbeat(), this.config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS)
    publishSystemEvent({ type: "agent.status", agentId: this.id, status: this.status })
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    this.stoppedAtMs = Date.now()
    this.status = "offline"
    this.recordHeartbeat()
    publishSystemEvent({ type: "agent.status", agentId: this.id, status: this.status })
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  onTask(handler: TaskHandler): void {
    this.taskHandlers.push(handler)
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler)
  }

  async executeTask(taskInput: Task): Promise<TaskResult> {
    if (this.status === "offline") await this.start()
    const task = normalizeTask(taskInput)
    const startedAt = isoNow()
    const startedMs = Date.now()
    this.status = "working"
    this.recordHeartbeat(task.title)
    writeTaskRecord(this.id, { task, result: null, status: "running", updatedAt: startedAt })
    publishSystemEvent({ type: "task.started", agentId: this.id, task: { id: task.id, title: task.title, district: task.district } })

    try {
      const handler = this.taskHandlers.at(-1)
      const handled = handler ? await handler(task, this) : undefined
      const completedAt = isoNow()
      const durationMs = Date.now() - startedMs
      const result: TaskResult = {
        taskId: task.id,
        agentId: this.id,
        status: "completed",
        summary: typeof handled === "string" ? handled : handled?.summary ?? `Completed task: ${task.title}`,
        output: typeof handled === "object" ? handled.output : undefined,
        startedAt,
        completedAt,
        durationMs,
      }
      this.metrics.tasksCompleted += 1
      this.taskDurations.push(durationMs)
      this.status = "idle"
      this.recordHeartbeat()
      writeTaskRecord(this.id, { task, result, status: "completed", updatedAt: completedAt })
      publishSystemEvent({ type: "task.completed", agentId: this.id, taskId: task.id, result: { summary: result.summary, durationMs } })
      return result
    } catch (error) {
      const completedAt = isoNow()
      const durationMs = Date.now() - startedMs
      const result: TaskResult = {
        taskId: task.id,
        agentId: this.id,
        status: "failed",
        summary: "Task failed",
        error: error instanceof Error ? error.message : "Unknown task failure",
        startedAt,
        completedAt,
        durationMs,
      }
      this.metrics.tasksFailed += 1
      this.status = "error"
      this.recordHeartbeat(task.title)
      writeTaskRecord(this.id, { task, result, status: "failed", updatedAt: completedAt })
      publishSystemEvent({ type: "task.completed", agentId: this.id, taskId: task.id, result: { summary: result.error ?? result.summary, durationMs } })
      return result
    }
  }

  async sendMessage(toAgentId: string, message: AgentMessage): Promise<void> {
    sendAgentMessage({ ...message, fromAgentId: this.id, toAgentId })
    this.metrics.messagesSent += 1
  }

  receiveMessage(message: AgentMessage): void {
    this.metrics.messagesReceived += 1
    for (const handler of this.messageHandlers) void handler(message, this)
  }

  getStatus(): AgentStatus {
    if (this.lastHeartbeatMs && Date.now() - this.lastHeartbeatMs > (this.config.offlineAfterMs ?? DEFAULT_OFFLINE_AFTER_MS)) return "offline"
    return this.status
  }

  getMetrics(): AgentMetrics {
    const uptimeMs = this.startedAtMs ? Math.max(0, (this.stoppedAtMs ?? Date.now()) - this.startedAtMs) : 0
    const totalDuration = this.taskDurations.reduce((sum, duration) => sum + duration, 0)
    return {
      ...this.metrics,
      startedAt: this.startedAtMs ? new Date(this.startedAtMs).toISOString() : null,
      stoppedAt: this.stoppedAtMs ? new Date(this.stoppedAtMs).toISOString() : null,
      lastHeartbeat: this.lastHeartbeatMs ? new Date(this.lastHeartbeatMs).toISOString() : null,
      uptimeMs,
      averageTaskDurationMs: this.taskDurations.length ? Math.round(totalDuration / this.taskDurations.length) : 0,
    }
  }

  private recordHeartbeat(currentTask: string | null = null): void {
    this.lastHeartbeatMs = Date.now()
    recordAgentHeartbeat(this.id, {
      status: this.status,
      cpu: this.config.cpu,
      memory: this.config.memory,
      currentTask,
      autoRestart: this.config.autoRestart,
      nowMs: this.lastHeartbeatMs,
    })
  }
}

export function getOrCreateAgent(config: AgentConfig): Agent {
  return runtimeState.agents.get(config.id) ?? new Agent(config)
}

export function getAgent(agentId: string): Agent | null {
  return runtimeState.agents.get(agentId) ?? null
}

export function normalizeTaskInput(input: unknown): Task {
  return normalizeTask(input)
}
