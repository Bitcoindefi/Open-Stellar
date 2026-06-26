import { NextResponse } from "next/server"

import { getQuestById, getSubTasks, updateSubTask } from "@/lib/gamification/quests"

type Context = {
  params: Promise<{ id: string; subtaskId: string }>
}

function sanitizeDependsOn(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .filter((dependency): dependency is string => typeof dependency === "string")
    .map((dependency) => dependency.trim())
    .filter((dependency) => dependency.length > 0)
}

export async function PATCH(req: Request, context: Context) {
  const { id, subtaskId } = await context.params
  const questId = decodeURIComponent(id)
  const decodedSubTaskId = decodeURIComponent(subtaskId)
  const quest = getQuestById(questId)

  if (!quest) {
    return NextResponse.json({ ok: false, error: "Quest not found" }, { status: 404 })
  }

  const subtasks = getSubTasks(questId)
  const subtask = subtasks.find((st) => st.id === decodedSubTaskId)
  if (!subtask) {
    return NextResponse.json({ ok: false, error: "Subtask not found" }, { status: 404 })
  }

  try {
    const body = await req.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const updates: {
      status?: "pending" | "in_progress" | "done"
      assignedAgentId?: string
      dependsOn?: string[]
    } = {}

    if (body.status !== undefined) {
      if (body.status !== "pending" && body.status !== "in_progress" && body.status !== "done") {
        return NextResponse.json({ ok: false, error: "Invalid status value" }, { status: 400 })
      }
      updates.status = body.status
    }

    if (body.assignedAgentId !== undefined) {
      updates.assignedAgentId = typeof body.assignedAgentId === "string" && body.assignedAgentId.trim().length > 0
        ? body.assignedAgentId.trim()
        : undefined
    }

    if (body.dependsOn !== undefined) {
      updates.dependsOn = sanitizeDependsOn(body.dependsOn)
    }

    if (updates.status === "done") {
      const dependsOn = updates.dependsOn ?? subtask.dependsOn ?? []
      const missing = dependsOn.filter((prerequisiteId) => {
        const prerequisite = subtasks.find((st) => st.id === prerequisiteId)
        return !prerequisite || prerequisite.status !== "done"
      })

      if (missing.length > 0) {
        return NextResponse.json(
          { ok: false, reason: "prerequisite_incomplete", missing },
          { status: 409 }
        )
      }
    }

    const updatedSubTask = updateSubTask(questId, decodedSubTaskId, updates)
    if (!updatedSubTask) {
      return NextResponse.json({ ok: false, error: "Failed to update subtask" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, subTask: updatedSubTask })
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }
}
