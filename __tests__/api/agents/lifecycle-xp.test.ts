import { beforeEach, describe, expect, it } from "vitest"
import { GET as getAgent } from "@/app/api/agents/[id]/route"
import { PATCH as completeTask } from "@/app/api/agents/[id]/tasks/[taskId]/route"
import { POST as assignTask } from "@/app/api/agents/[id]/tasks/route"
import { POST as registerAgent } from "@/app/api/agents/route"
import { resetAgentRegistryForTests } from "@/lib/agent-registry"
import { dequeueNextTask, resetTaskQueue } from "@/lib/agents/task-queue"
import { checkLevelUp, resetAgentXpDb } from "@/lib/gamification/xp"

function agentContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function taskContext(id: string, taskId: string) {
  return { params: Promise.resolve({ id, taskId }) }
}

describe("agent registration to task XP lifecycle", () => {
  beforeEach(() => {
    resetAgentRegistryForTests()
    resetTaskQueue()
    resetAgentXpDb()
  })

  it("registers an agent, completes an assigned task, and exposes updated progress", async () => {
    const agentId = `e2e-agent-${crypto.randomUUID()}`
    const registration = await registerAgent(new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        model: "test/e2e",
        district: "data-center",
        capabilities: ["task-execution"],
        x402: { accepts: false },
        status: "active",
        endpoint: `https://example.test/agents/${agentId}`,
      }),
    }))

    expect(registration.status).toBe(201)

    const beforeResponse = await getAgent(
      new Request(`http://localhost/api/agents/${agentId}`),
      agentContext(agentId),
    )
    const before = await beforeResponse.json()

    expect(before.agent).toMatchObject({
      agentId,
      xp: 0,
      level: 1,
      tasksCompleted: 0,
    })

    const assignment = await assignTask(new Request(`http://localhost/api/agents/${agentId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "e2e.lifecycle", payload: { issue: 219 } }),
    }), agentContext(agentId))
    const assigned = await assignment.json()

    expect(assignment.status).toBe(201)
    expect(assigned.taskId).toEqual(expect.any(String))

    const runningTask = dequeueNextTask(agentId)
    expect(runningTask?.id).toBe(assigned.taskId)

    const completion = await completeTask(new Request(
      `http://localhost/api/agents/${agentId}/tasks/${assigned.taskId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", result: { ok: true } }),
      },
    ), taskContext(agentId, assigned.taskId))
    const completed = await completion.json()

    expect(completion.status).toBe(200)
    expect(completed.task.status).toBe("completed")

    const afterResponse = await getAgent(
      new Request(`http://localhost/api/agents/${agentId}`),
      agentContext(agentId),
    )
    const after = await afterResponse.json()

    expect(after.agent.xp).toBeGreaterThan(before.agent.xp)
    expect(after.agent.tasksCompleted).toBe(1)
    expect(after.agent.level).toBe(checkLevelUp(after.agent.xp).level)
  })

  it("returns 404 when assigning a task to an unregistered agent", async () => {
    const missingAgentId = `missing-agent-${crypto.randomUUID()}`
    const response = await assignTask(new Request(
      `http://localhost/api/agents/${missingAgentId}/tasks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "e2e.lifecycle" }),
      },
    ), agentContext(missingAgentId))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ ok: false, error: "agent not found" })
  })
})
