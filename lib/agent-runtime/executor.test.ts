import { describe, expect, it, beforeEach } from "vitest"
import { executeTask } from "@/lib/agent-runtime/executor"
import { getAgentTools } from "@/lib/agent-runtime/tools"
import { getAgentClaudeAnalytics, resetClaudeCostRecordsForTests } from "@/lib/agent-runtime/costs"
import type { MoltbotAgent } from "@/lib/types"

const baseAgent: MoltbotAgent = {
  id: "bot-test",
  name: "Test Agent",
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
  skills: [{ id: "s1", name: "Threat Detection", level: 2, maxLevel: 5, xp: 0, xpToNext: 10 }],
  appearance: { skin: "default", accessories: [], customColor: null },
}

describe("Claude-backed agent executor", () => {
  beforeEach(() => resetClaudeCostRecordsForTests())

  it("passes district tools, prompt, and task payload to Claude", async () => {
    const calls: Record<string, unknown>[] = []
    const client = {
      messages: {
        async create(input: Record<string, unknown>) {
          calls.push(input)
          return {
            content: [{ type: "text", text: "Threat scan completed." }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1000, output_tokens: 200 },
          }
        },
      },
    }

    const result = await executeTask(baseAgent, { id: "task-1", title: "Scan", payload: { target: "edge" } }, { client })

    expect(result.summary).toBe("Threat scan completed.")
    expect(result.cost.costUsd).toBeGreaterThan(0)
    expect(calls[0].model).toBe("claude-sonnet-4-5-20250929")
    expect(String(calls[0].system)).toContain("Defense Grid")
    expect(calls[0].messages).toEqual([{ role: "user", content: expect.stringContaining('"target": "edge"') }])
    expect(calls[0].tools).toEqual(getAgentTools("defense"))
  })

  it("tracks per-agent daily budget analytics", async () => {
    const client = {
      messages: {
        async create() {
          return {
            content: [{ type: "text", text: "done" }],
            usage: { input_tokens: 2_000_000, output_tokens: 500_000 },
          }
        },
      },
    }

    await executeTask(baseAgent, { id: "task-2", payload: "expensive" }, { client })

    const analytics = getAgentClaudeAnalytics(baseAgent.id, 1)
    expect(analytics.taskCount).toBe(1)
    expect(analytics.dailySpendUsd).toBeGreaterThan(1)
    expect(analytics.overDailyBudget).toBe(true)
  })
})
