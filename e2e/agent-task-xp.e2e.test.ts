import { beforeEach, describe, expect, it } from "vitest"
import { GET as getAgent } from "@/app/api/agents/[id]/route"
import { PATCH as completeTask } from "@/app/api/agents/[id]/tasks/[taskId]/route"
import { POST as assignTask, DELETE as purgeTasks } from "@/app/api/agents/[id]/tasks/route"
import { POST as registerAgentRoute } from "@/app/api/agents/route"
import { resetAgentRegistryForTests } from "@/lib/agent-registry"
import { dequeueNextTask, resetTaskQueue } from "@/lib/agents/task-queue"
import { checkLevelUp, getAgentXP, resetAgentXpDb } from "@/lib/gamification/xp"

/**
 * END-TO-END (issue #219): registration -> task assignment -> completion -> XP.
 *
 * Runs against the real Next.js route handlers (no mocks), exercising exactly
 * the HTTP contract a client sees: 201 register, 201 assign, 200 complete,
 * then GET /api/agents/[id] shows xp / level / tasksCompleted updated.
 *
 * Isolation: each run uses a unique `e2e-agent-<uuid>` id and its own
 * in-memory registry/task/xp stores (reset in beforeEach), so nothing here
 * can touch real data; afterAll purges the queue via DELETE /tasks.
 */

function agentContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function taskContext(id: string, taskId: string) {
  return { params: Promise.resolve({ id, taskId }) }
}

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("e2e: agent registration -> task assignment -> XP earned", () => {
  let agentId: string

  beforeEach(() => {
    resetAgentRegistryForTests()
    resetTaskQueue()
    resetAgentXpDb()
    agentId = `e2e-agent-${crypto.randomUUID()}`
  })

  it("runs the full flow: 201 -> 201 -> 200 -> XP/level/tasksCompleted updated", async () => {
    // Step 1: register
    const registration = await registerAgentRoute(
      post("http://localhost/api/agents", {
        agentId,
        model: "test/e2e",
        district: "data-center",
        capabilities: ["task-execution"],
        x402: { accepts: false },
        status: "active",
        endpoint: `https://example.test/agents/${agentId}`,
      }),
    )
    expect(registration.status, "step 1: register returns 201").toBe(201)

    const initialBody = await (
      await getAgent(new Request(`http://localhost/api/agents/${agentId}`), agentContext(agentId))
    ).json()
    expect(initialBody.agent).toMatchObject({ agentId, xp: 0, level: 1, tasksCompleted: 0 })

    // Step 2: assign a task
    const assignment = await assignTask(
      post(`http://localhost/api/agents/${agentId}/tasks`, {
        type: "e2e.lifecycle",
        payload: { issue: 219 },
      }),
      agentContext(agentId),
    )
    const assigned = await assignment.json()
    expect(assignment.status, "step 2: assign returns 201").toBe(201)
    expect(assigned.taskId).toEqual(expect.any(String))

    // The agent dequeues the task (pending -> running) before working on it.
    const running = dequeueNextTask(agentId)
    expect(running?.id, "task must transition to running").toBe(assigned.taskId)

    // Step 3: complete the task
    const completion = await completeTask(
      post(`http://localhost/api/agents/${agentId}/tasks/${assigned.taskId}`, {
        status: "completed",
        result: { ok: true },
      }),
      taskContext(agentId, assigned.taskId),
    )
    const completed = await completion.json()
    expect(completion.status, "step 3: complete returns 200").toBe(200)
    expect(completed.task.status).toBe("completed")

    // Step 4: progress fields are updated
    const afterBody = await (
      await getAgent(new Request(`http://localhost/api/agents/${agentId}`), agentContext(agentId))
    ).json()

    expect(afterBody.agent.xp, "step 4: xp increased").toBeGreaterThan(initialBody.agent.xp)
    expect(afterBody.agent.tasksCompleted, "tasksCompleted incremented").toBe(1)
    expect(afterBody.agent.level, "level follows the XP curve").toBe(
      checkLevelUp(afterBody.agent.xp).level,
    )
  })

  it("never awards XP twice for one task", async () => {
    await registerAgentRoute(
      post("http://localhost/api/agents", {
        agentId,
        model: "test/e2e",
        district: "data-center",
        capabilities: ["task-execution"],
        x402: { accepts: false },
        status: "active",
        endpoint: `https://example.test/agents/${agentId}`,
      }),
    )

    const assigned = await (
      await assignTask(
        post(`http://localhost/api/agents/${agentId}/tasks`, { type: "e2e.once" }),
        agentContext(agentId),
      )
    ).json()

    dequeueNextTask(agentId)

    const first = await completeTask(
      post(`http://localhost/api/agents/${agentId}/tasks/${assigned.taskId}`, {
        status: "completed",
      }),
      taskContext(agentId, assigned.taskId),
    )
    expect(first.status).toBe(200)
    const xpAfterFirst = getAgentXP(agentId).xp

    // Second completion attempt on the SAME task must be rejected...
    const second = await completeTask(
      post(`http://localhost/api/agents/${agentId}/tasks/${assigned.taskId}`, {
        status: "completed",
      }),
      taskContext(agentId, assigned.taskId),
    )
    expect(second.status, "double completion is rejected").toBe(404)

    // ...and XP must not have moved.
    expect(getAgentXP(agentId).xp, "XP unchanged after rejected double completion").toBe(xpAfterFirst)
  })

  it("returns 404 when assigning to a non-existent agent", async () => {
    const ghost = `e2e-agent-missing-${crypto.randomUUID()}`
    const response = await assignTask(
      post(`http://localhost/api/agents/${ghost}/tasks`, { type: "e2e.ghost" }),
      agentContext(ghost),
    )
    expect(response.status, "unknown agent returns 404").toBe(404)
    const body = await response.json()
    expect(body.ok).toBe(false)
  })

  it("purges the test agent's queue on cleanup", async () => {
    await registerAgentRoute(
      post("http://localhost/api/agents", {
        agentId,
        model: "test/e2e",
        district: "data-center",
        capabilities: ["task-execution"],
        x402: { accepts: false },
        status: "active",
        endpoint: `https://example.test/agents/${agentId}`,
      }),
    )
    await assignTask(
      post(`http://localhost/api/agents/${agentId}/tasks`, { type: "e2e.cleanup" }),
      agentContext(agentId),
    )
    const purge = await purgeTasks(
      new Request(`http://localhost/api/agents/${agentId}/tasks`, { method: "DELETE" }),
      agentContext(agentId),
    )
    const body = await purge.json()
    expect(purge.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.purged).toBeGreaterThanOrEqual(1)
  })
})
