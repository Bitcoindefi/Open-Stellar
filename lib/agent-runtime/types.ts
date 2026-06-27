import type { AgentStatus, DistrictId, MoltbotAgent } from "@/lib/types"
import type { AgentMessage } from "@/lib/agent-runtime/messaging"

export type TaskStatus = "queued" | "running" | "completed" | "failed"

export interface Task {
  id: string
  title: string
  description?: string
  payload?: unknown
  district?: DistrictId
  createdAt?: string
}

export interface TaskResult {
  taskId: string
  agentId: string
  status: Extract<TaskStatus, "completed" | "failed">
  summary: string
  output?: unknown
  error?: string
  startedAt: string
  completedAt: string
  durationMs: number
}

export type TaskHandler = (task: Task, agent: AgentRuntimeContext) => Promise<Partial<TaskResult> | string | void> | Partial<TaskResult> | string | void
export type MessageHandler = (message: AgentMessage, agent: AgentRuntimeContext) => Promise<void> | void

export interface AgentMetrics {
  tasksCompleted: number
  tasksFailed: number
  messagesSent: number
  messagesReceived: number
  startedAt: string | null
  stoppedAt: string | null
  lastHeartbeat: string | null
  uptimeMs: number
  averageTaskDurationMs: number
}

export interface AgentConfig extends Partial<Omit<MoltbotAgent, "status">> {
  id: string
  name: string
  model: string
  status?: AgentStatus
  heartbeatIntervalMs?: number
  offlineAfterMs?: number
}

export interface AgentRuntimeContext {
  id: string
  config: AgentConfig
  getStatus(): AgentStatus
  getMetrics(): AgentMetrics
}

export { AgentMessage }
