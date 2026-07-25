import { buildAgentSystemPrompt } from "@/lib/agent-runtime/prompts"
import { recordClaudeTaskCost, type ClaudeCostRecord } from "@/lib/agent-runtime/costs"
import { getAgentTools } from "@/lib/agent-runtime/tools"
import type { MoltbotAgent } from "@/lib/types"

export interface AgentTask {
  id: string
  title?: string
  payload: unknown
}

export interface TaskResult {
  taskId: string
  agentId: string
  model: string
  summary: string
  rawContent: unknown
  stopReason?: string
  cost: ClaudeCostRecord
}

interface ClaudeMessagesClient {
  messages: {
    create(input: Record<string, unknown>): Promise<{
      content?: Array<{ type: string; text?: string; [key: string]: unknown }>
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }>
  }
}

export function formatTask(task: AgentTask): string {
  return JSON.stringify({ id: task.id, title: task.title, payload: task.payload }, null, 2)
}

function normalizeClaudeModel(model: string): string {
  if (model.startsWith("claude-") && /-\d{8}$/.test(model)) return model
  const aliases: Record<string, string> = {
    "claude-4-sonnet": "claude-sonnet-4-5-20250929",
    "claude-4-opus": "claude-opus-4-5-20251101",
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
    "claude-3.5-haiku": "claude-3-5-haiku-20241022",
  }
  return aliases[model] ?? model
}

function parseSummary(content: TaskResult["rawContent"]): string {
  if (!Array.isArray(content)) return "Claude returned no text content."
  const text = content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n").trim()
  return text || "Claude returned tool calls without a final text summary."
}

function createFetchClaudeClient(apiKey: string): ClaudeMessagesClient {
  return {
    messages: {
      async create(input) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(input),
        })
        if (!response.ok) throw new Error(`Claude API failed with ${response.status}: ${await response.text()}`)
        return response.json()
      },
    },
  }
}

export async function executeTask(agent: MoltbotAgent, task: AgentTask, options: { client?: ClaudeMessagesClient; apiKey?: string; maxTokens?: number } = {}): Promise<TaskResult> {
  const client = options.client ?? createFetchClaudeClient(options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "")
  if (!options.client && !(options.apiKey ?? process.env.ANTHROPIC_API_KEY)) throw new Error("ANTHROPIC_API_KEY is required to execute Claude-backed agent tasks")

  const model = normalizeClaudeModel(agent.model)
  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? 2048,
    system: buildAgentSystemPrompt(agent),
    messages: [{ role: "user", content: formatTask(task) }],
    tools: getAgentTools(agent.district),
  })

  const cost = recordClaudeTaskCost({
    taskId: task.id,
    agentId: agent.id,
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  })

  return {
    taskId: task.id,
    agentId: agent.id,
    model,
    summary: parseSummary(response.content),
    rawContent: response.content ?? [],
    stopReason: response.stop_reason,
    cost,
  }
}
