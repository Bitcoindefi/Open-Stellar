import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { executeTask } from "@/lib/agent-runtime/executor"
import { getAgentTools } from "@/lib/agent-runtime/tools"
import { resetClaudeCostRecordsForTests } from "@/lib/agent-runtime/costs"
import type { MoltbotAgent } from "@/lib/types"

const baseAgent: MoltbotAgent = {
  id: "exec-test-agent",
  name: "Executor Test Agent",
  model: "claude-4-sonnet",
  status: "active",
  district: "defense",
  cpu: 10,
  memory: 20,
  tasksCompleted: 0,
  currentTask: null,
  taskProgress: 0,
  color: "#fff",
  pixelX: 0,
  pixelY: 0,
  targetX: 0,
  targetY: 0,
  frame: 0,
  direction: "right",
  spriteId: 0,
  skills: [],
  appearance: { skin: "default", accessories: [], customColor: null },
}

const baseTask = { id: "task-exec-1", title: "Test Task", payload: { action: "scan" } }

function mockClient(overrides: {
  content?: Array<{ type: string; text?: string }>
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
  throws?: Error
  onCall?: (input: Record<string, unknown>) => void
}) {
  return {
    messages: {
      async create(input: Record<string, unknown>) {
        overrides.onCall?.(input)
        if (overrides.throws) throw overrides.throws
        return {
          content: overrides.content ?? [{ type: "text", text: "ok" }],
          stop_reason: overrides.stop_reason ?? "end_turn",
          usage: { input_tokens: 100, output_tokens: 50, ...overrides.usage },
        }
      },
    },
  }
}

describe("executor — core logic paths", () => {
  beforeEach(() => resetClaudeCostRecordsForTests())
  afterEach(() => vi.unstubAllEnvs())

  it("throws when ANTHROPIC_API_KEY is absent and no client is injected", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    await expect(executeTask(baseAgent, baseTask)).rejects.toThrow(
      "ANTHROPIC_API_KEY is required",
    )
  })

  it("returns the assistant text from a successful response", async () => {
    const client = mockClient({ content: [{ type: "text", text: "Threat neutralized." }] })
    const result = await executeTask(baseAgent, baseTask, { client })
    expect(result.summary).toBe("Threat neutralized.")
    expect(result.taskId).toBe(baseTask.id)
    expect(result.agentId).toBe(baseAgent.id)
    expect(result.stopReason).toBe("end_turn")
  })

  it("accumulates input and output token costs correctly", async () => {
    const client = mockClient({ usage: { input_tokens: 1_000, output_tokens: 200 } })
    const result = await executeTask(baseAgent, baseTask, { client })

    // claude-sonnet-4-5 → $3 / M input, $15 / M output
    const expectedUsd = (1_000 / 1_000_000) * 3 + (200 / 1_000_000) * 15
    expect(result.cost.inputTokens).toBe(1_000)
    expect(result.cost.outputTokens).toBe(200)
    expect(result.cost.costUsd).toBeCloseTo(expectedUsd, 8)
    expect(result.cost.taskId).toBe(baseTask.id)
    expect(result.cost.agentId).toBe(baseAgent.id)
  })

  it("propagates a descriptive error on non-200 response", async () => {
    const client = mockClient({
      throws: new Error("Claude API failed with 429: Rate limited"),
    })
    await expect(executeTask(baseAgent, baseTask, { client })).rejects.toThrow(
      "Claude API failed with 429",
    )
  })

  it("passes district tool definitions through to the client call", async () => {
    const captured: Record<string, unknown>[] = []
    const client = mockClient({ onCall: (input) => captured.push(input) })

    await executeTask(baseAgent, baseTask, { client })

    expect(captured).toHaveLength(1)
    expect(captured[0].tools).toEqual(getAgentTools(baseAgent.district))
  })
})
