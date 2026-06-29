import { describe, expect, it, beforeEach, afterEach } from "vitest"

import { POST as applyQuestRoute } from "@/app/api/quests/[id]/apply/route"
import { POST as createSubTaskRoute } from "@/app/api/quests/[id]/subtasks/route"
import { PATCH as updateSubTaskRoute } from "@/app/api/quests/[id]/subtasks/[subtaskId]/route"
import { getQuestById, getSubTasks } from "@/lib/gamification/quests"

const context = (id: string) => ({ params: Promise.resolve({ id }) })
const subtaskContext = (id: string, subtaskId: string) => ({
  params: Promise.resolve({ id, subtaskId }),
})

function makeCreateRequest(body: object, questId = "weekly-onboard-marketplace-service"): Request {
  return new Request(`http://localhost/api/quests/${questId}/subtasks`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

function makeUpdateRequest(body: object, questId = "weekly-onboard-marketplace-service", subtaskId = "some-id"): Request {
  return new Request(`http://localhost/api/quests/${questId}/subtasks/${subtaskId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

const GATEWAY_TOKEN = "test-gateway-token"

function makeApplyRequest(actorId: string): Request {
  return new Request("http://localhost/api/quests/weekly-onboard-marketplace-service/apply", {
    method: "POST",
    body: JSON.stringify({ actorId }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
    },
  })
}

describe("Quest Subtasks API", () => {
  const questId = "weekly-onboard-marketplace-service"

  let originalToken: string | undefined

  beforeEach(() => {
    originalToken = process.env.MOLTBOT_GATEWAY_TOKEN
    process.env.MOLTBOT_GATEWAY_TOKEN = GATEWAY_TOKEN
  })

  afterEach(() => {
    if (originalToken === undefined) delete process.env.MOLTBOT_GATEWAY_TOKEN
    else process.env.MOLTBOT_GATEWAY_TOKEN = originalToken
  })

  it("POST /api/quests/[id]/subtasks creates a sub-task with a unique ID", async () => {
    const res = await createSubTaskRoute(
      makeCreateRequest({ title: "Setup service metadata", assignedAgentId: "agent-123" }),
      context(questId)
    )
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.subTask.id).toBeDefined()
    expect(data.subTask.title).toBe("Setup service metadata")
    expect(data.subTask.assignedAgentId).toBe("agent-123")
    expect(data.subTask.status).toBe("pending")
  })

  it("PATCH updates status and assignment; completing all sub-tasks marks parent quest complete", async () => {
    const subTasksBefore = getSubTasks(questId)
    expect(subTasksBefore.length).toBeGreaterThan(0)
    const firstSubTask = subTasksBefore[0]

    const resCreate = await createSubTaskRoute(
      makeCreateRequest({ title: "Deploy smart contract" }),
      context(questId)
    )
    const createData = await resCreate.json()
    const secondSubTask = createData.subTask

    let parentQuest = getQuestById(questId)
    expect(parentQuest).toBeDefined()
    expect(parentQuest?.progress).toBeLessThan(100)
    expect(parentQuest?.status).toBe("in_progress")
    expect(parentQuest?.completedAt).toBeUndefined()

    const resPatch1 = await updateSubTaskRoute(
      makeUpdateRequest({ status: "done" }),
      subtaskContext(questId, firstSubTask.id)
    )
    const patchData1 = await resPatch1.json()
    expect(resPatch1.status).toBe(200)
    expect(patchData1.subTask.status).toBe("done")
    expect(patchData1.subTask.completedAt).toBeDefined()

    parentQuest = getQuestById(questId)
    expect(parentQuest?.status).toBe("in_progress")
    expect(parentQuest?.progress).toBe(50)
    expect(parentQuest?.completedAt).toBeUndefined()

    const resApplyFail = await applyQuestRoute(
      makeApplyRequest("test-actor"),
      context(questId)
    )
    expect(resApplyFail.status).toBe(400)
    const applyFailData = await resApplyFail.json()
    expect(applyFailData.ok).toBe(false)
    expect(applyFailData.error).toContain("Cannot complete quest with pending sub-tasks")

    const resPatch2 = await updateSubTaskRoute(
      makeUpdateRequest({ status: "done", assignedAgentId: "agent-456" }),
      subtaskContext(questId, secondSubTask.id)
    )
    const patchData2 = await resPatch2.json()
    expect(resPatch2.status).toBe(200)
    expect(patchData2.subTask.status).toBe("done")
    expect(patchData2.subTask.assignedAgentId).toBe("agent-456")

    parentQuest = getQuestById(questId)
    expect(parentQuest?.status).toBe("completed")
    expect(parentQuest?.progress).toBe(100)
    expect(parentQuest?.completedAt).toBeDefined()
  })

  it("PATCH completes a subtask with no dependencies", async () => {
    const independentQuestId = "daily-complete-5-tasks"
    const resCreate = await createSubTaskRoute(
      makeCreateRequest({ title: "Complete independent task" }, independentQuestId),
      context(independentQuestId)
    )
    const createData = await resCreate.json()

    const resPatch = await updateSubTaskRoute(
      makeUpdateRequest({ status: "done" }, independentQuestId, createData.subTask.id),
      subtaskContext(independentQuestId, createData.subTask.id)
    )
    const patchData = await resPatch.json()

    expect(resPatch.status).toBe(200)
    expect(patchData.ok).toBe(true)
    expect(patchData.subTask.status).toBe("done")
  })

  it("PATCH blocks completion when one dependency is incomplete", async () => {
    const dependentQuestId = "daily-process-payment"
    const prerequisiteRes = await createSubTaskRoute(
      makeCreateRequest({ title: "Publish prerequisite" }, dependentQuestId),
      context(dependentQuestId)
    )
    const prerequisite = (await prerequisiteRes.json()).subTask
    const dependentRes = await createSubTaskRoute(
      makeCreateRequest({ title: "Complete dependent task", dependsOn: [prerequisite.id] }, dependentQuestId),
      context(dependentQuestId)
    )
    const dependent = (await dependentRes.json()).subTask

    const resPatch = await updateSubTaskRoute(
      makeUpdateRequest({ status: "done" }, dependentQuestId, dependent.id),
      subtaskContext(dependentQuestId, dependent.id)
    )
    const patchData = await resPatch.json()

    expect(resPatch.status).toBe(409)
    expect(patchData).toEqual({
      ok: false,
      reason: "prerequisite_incomplete",
      missing: [prerequisite.id],
    })
  })

  it("PATCH completes a subtask once one dependency is done", async () => {
    const dependentQuestId = "daily-uptime-99"
    const prerequisiteRes = await createSubTaskRoute(
      makeCreateRequest({ title: "Finish prerequisite" }, dependentQuestId),
      context(dependentQuestId)
    )
    const prerequisite = (await prerequisiteRes.json()).subTask
    const dependentRes = await createSubTaskRoute(
      makeCreateRequest({ title: "Complete dependent task", dependsOn: [prerequisite.id] }, dependentQuestId),
      context(dependentQuestId)
    )
    const dependent = (await dependentRes.json()).subTask

    const resPrerequisitePatch = await updateSubTaskRoute(
      makeUpdateRequest({ status: "done" }, dependentQuestId, prerequisite.id),
      subtaskContext(dependentQuestId, prerequisite.id)
    )
    expect(resPrerequisitePatch.status).toBe(200)

    const resPatch = await updateSubTaskRoute(
      makeUpdateRequest({ status: "done" }, dependentQuestId, dependent.id),
      subtaskContext(dependentQuestId, dependent.id)
    )
    const patchData = await resPatch.json()

    expect(resPatch.status).toBe(200)
    expect(patchData.ok).toBe(true)
    expect(patchData.subTask.status).toBe("done")
  })

  it("PATCH blocks completion with two dependencies when one is incomplete and one is missing", async () => {
    const dependentQuestId = "daily-send-10-messages"
    const incompletePrerequisiteRes = await createSubTaskRoute(
      makeCreateRequest({ title: "Incomplete prerequisite" }, dependentQuestId),
      context(dependentQuestId)
    )
    const incompletePrerequisite = (await incompletePrerequisiteRes.json()).subTask
    const dependentRes = await createSubTaskRoute(
      makeCreateRequest({
        title: "Complete dependent task",
        dependsOn: [incompletePrerequisite.id, "missing-prerequisite"],
      }, dependentQuestId),
      context(dependentQuestId)
    )
    const dependent = (await dependentRes.json()).subTask

    const resPatch = await updateSubTaskRoute(
      makeUpdateRequest({ status: "done" }, dependentQuestId, dependent.id),
      subtaskContext(dependentQuestId, dependent.id)
    )
    const patchData = await resPatch.json()

    expect(resPatch.status).toBe(409)
    expect(patchData).toEqual({
      ok: false,
      reason: "prerequisite_incomplete",
      missing: [incompletePrerequisite.id, "missing-prerequisite"],
    })
  })
})
