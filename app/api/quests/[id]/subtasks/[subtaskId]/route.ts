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

/**
 * Detects if adding `dependsOn` to `targetId` would create a cycle.
 * Returns the cycle path as an array of unique node IDs in order,
 * rotated so the first element is the earliest node in the subtasks order.
 * Returns null if no cycle exists.
 */
function detectCycle(
  subtasks: { id: string; dependsOn?: string[] }[],
  targetId: string,
  newDependsOn: string[]
): string[] | null {
  // Build adjacency map from all subtasks
  const graph = new Map<string, string[]>()
  for (const st of subtasks) {
    graph.set(st.id, st.dependsOn ? [...st.dependsOn] : [])
  }

  // Apply the proposed update
  graph.set(targetId, [...newDependsOn])

  // DFS with recursion stack to detect back edge
  const visited = new Set<string>()
  const recStack = new Set<string>()
  const path: string[] = []

  function dfs(node: string): string[] | null {
    visited.add(node)
    recStack.add(node)
    path.push(node)

    const neighbors = graph.get(node) ?? []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = dfs(neighbor)
        if (cycle) return cycle
      } else if (recStack.has(neighbor)) {
        // Found cycle — extract the loop from path
        const cycleStart = path.indexOf(neighbor)
        const cyclePath = path.slice(cycleStart)

        // Rotate cycle so the first element is the one that appears
        // earliest in the subtasks array (for stable test output)
        const subtaskOrder = new Map(subtasks.map((st, i) => [st.id, i]))
        let earliestIndex = 0
        let earliestOrder = Infinity
        for (let i = 0; i < cyclePath.length; i++) {
          const order = subtaskOrder.get(cyclePath[i]) ?? Infinity
          if (order < earliestOrder) {
            earliestOrder = order
            earliestIndex = i
          }
        }
        const rotated = [
          ...cyclePath.slice(earliestIndex),
          ...cyclePath.slice(0, earliestIndex),
        ]
        return rotated
      }
    }

    path.pop()
    recStack.delete(node)
    return null
  }

  return dfs(targetId)
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

    // --- CYCLE DETECTION ---
    if (updates.dependsOn !== undefined) {
      const cycle = detectCycle(subtasks, decodedSubTaskId, updates.dependsOn)
      if (cycle) {
        return NextResponse.json(
          { ok: false, error: "circular_dependency", cycle },
          { status: 422 }
        )
      }
    }
    // -----------------------

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
