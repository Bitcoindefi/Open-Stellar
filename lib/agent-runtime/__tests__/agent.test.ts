import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Agent } from "@/lib/agent-runtime/agent"
import type { AgentConfig, Task } from "@/lib/agent-runtime/types"
import { POST } from "@/app/api/agents/[id]/task/route"

const jest = vi

function createConfig(id: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id,
    name: `Agent ${id}`,
    model: "claude/test",
    heartbeatIntervalMs: 1_000,
    offlineAfterMs: 60_000,
    ...overrides,
  }
}

function createTask(id = "task-1"): Task {
  return {
    id,
    title: "Test task",
    payload: { ok: true },
    createdAt: new Date(Date.now()).toISOString(),
  }
}

describe("Agent SDK lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date("2026-06-30T00:00:00.000Z"))
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    vi.restoreAllMocks()
  })

  it("start() transitions agent status from idle to running and starts the heartbeat", async () => {
    const agent = new Agent(createConfig("agent-start"))

    expect(agent.getStatus()).toBe("idle")

    await agent.start()
    const firstHeartbeat = agent.getMetrics().lastHeartbeat

    expect(agent.getStatus()).toBe("running")
    expect(firstHeartbeat).toBe("2026-06-30T00:00:00.000Z")

    jest.advanceTimersByTime(1_000)

    expect(agent.getMetrics().lastHeartbeat).toBe("2026-06-30T00:00:01.000Z")
  })

  it("stop() transitions to stopped and clears the heartbeat interval", async () => {
    const agent = new Agent(createConfig("agent-stop"))
    await agent.start()

    jest.advanceTimersByTime(1_000)
    await agent.stop()
    const stoppedHeartbeat = agent.getMetrics().lastHeartbeat

    expect(agent.getStatus()).toBe("stopped")

    jest.advanceTimersByTime(5_000)

    expect(agent.getMetrics().lastHeartbeat).toBe(stoppedHeartbeat)
  })

  it("restart() calls stop() then start()", async () => {
    const agent = new Agent(createConfig("agent-restart"))
    const calls: string[] = []
    const stopSpy = vi.spyOn(agent, "stop").mockImplementation(async () => { calls.push("stop") })
    const startSpy = vi.spyOn(agent, "start").mockImplementation(async () => { calls.push("start") })

    await agent.restart()

    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(["stop", "start"])
  })

  it("executeTask() sets status to working, calls the executor, and returns to running", async () => {
    const agent = new Agent(createConfig("agent-task"))
    await agent.start()
    const task = createTask()
    const handler = vi.fn(() => {
      expect(agent.getStatus()).toBe("working")
      return "executor completed"
    })
    agent.onTask(handler)

    const result = await agent.executeTask(task)

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: task.id }), agent)
    expect(result).toMatchObject({ taskId: task.id, agentId: agent.id, status: "completed", summary: "executor completed" })
    expect(agent.getStatus()).toBe("running")
  })

  it("executeTask() on a stopped agent throws an error", async () => {
    const agent = new Agent(createConfig("agent-stopped-task"))
    await agent.start()
    await agent.stop()

    await expect(agent.executeTask(createTask())).rejects.toThrow("Cannot execute task on a stopped agent")
  })

  it("heartbeat updates lastSeen timestamp every interval", async () => {
    const agent = new Agent(createConfig("agent-heartbeat", { heartbeatIntervalMs: 2_500 }))
    await agent.start()

    expect(agent.getMetrics().lastHeartbeat).toBe("2026-06-30T00:00:00.000Z")

    jest.advanceTimersByTime(2_500)
    expect(agent.getMetrics().lastHeartbeat).toBe("2026-06-30T00:00:02.500Z")

    jest.advanceTimersByTime(2_500)
    expect(agent.getMetrics().lastHeartbeat).toBe("2026-06-30T00:00:05.000Z")
  })

  it("POST /api/agents/[id]/task returns 404 for unknown agent IDs", async () => {
    const response = await POST(
      new Request("http://localhost/api/agents/not-a-real-agent/task", {
        method: "POST",
        body: JSON.stringify(createTask("missing-agent-task")),
      }),
      { params: Promise.resolve({ id: "not-a-real-agent" }) },
    )

    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "agent_not_found" })
    expect(response.status).toBe(404)
  })
})
