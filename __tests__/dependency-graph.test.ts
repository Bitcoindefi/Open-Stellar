import { describe, it, expect } from "vitest"
import { hasCycle } from "@/lib/quests/dependency-graph"
import type { SubTask } from "@/lib/gamification/quests"

function makeSubTask(id: string, dependsOn?: string[]): SubTask {
  return {
    id,
    title: `Subtask ${id}`,
    status: "pending",
    ...(dependsOn !== undefined ? { dependsOn } : {}),
  }
}

describe("hasCycle", () => {
  it("detects direct 2-node cycle (A -> B, B -> A)", () => {
    const subtasks = [
      makeSubTask("A", ["B"]),
      makeSubTask("B"),
    ]

    const result = hasCycle(subtasks, "B", "A")
    expect(result.hasCycle).toBe(true)
    expect(result.cycle).toContain("B")
    expect(result.cycle).toContain("A")
    expect(result.cycle[0]).toBe("A") // path starts from toId
    expect(result.cycle[result.cycle.length - 1]).toBe("B") // ends back at fromId
  })

  it("detects indirect 3-node cycle (A -> B -> C -> A)", () => {
    const subtasks = [
      makeSubTask("A", ["B"]),
      makeSubTask("B", ["C"]),
      makeSubTask("C"),
    ]

    const result = hasCycle(subtasks, "C", "A")
    expect(result.hasCycle).toBe(true)
    expect(result.cycle).toEqual(["A", "B", "C"])
  })

  it("allows diamond dependency (no cycle)", () => {
    // A -> B, A -> C, B -> D, C -> D
    const subtasks = [
      makeSubTask("A", ["B", "C"]),
      makeSubTask("B", ["D"]),
      makeSubTask("C", ["D"]),
      makeSubTask("D"),
    ]

    // Proposing any edge should not create a cycle
    const resultAB = hasCycle(subtasks, "A", "B")
    expect(resultAB.hasCycle).toBe(false)
    expect(resultAB.cycle).toEqual([])

    const resultBD = hasCycle(subtasks, "B", "D")
    expect(resultBD.hasCycle).toBe(false)
    expect(resultBD.cycle).toEqual([])
  })

  it("allows valid chain without cycle", () => {
    const subtasks = [
      makeSubTask("A", ["B"]),
      makeSubTask("B", ["C"]),
      makeSubTask("C"),
    ]

    // Adding C -> nothing new is fine
    const result = hasCycle(subtasks, "C", "D")
    // D doesn't exist in subtasks, but the edge C->D wouldn't create a cycle
    // because D has no outgoing edges
    expect(result.hasCycle).toBe(false)
  })

  it("returns empty cycle array when no cycle", () => {
    const subtasks = [
      makeSubTask("A"),
      makeSubTask("B"),
    ]

    const result = hasCycle(subtasks, "A", "B")
    expect(result.hasCycle).toBe(false)
    expect(result.cycle).toEqual([])
  })

  it("detects self-dependency as cycle", () => {
    const subtasks = [makeSubTask("A")]

    const result = hasCycle(subtasks, "A", "A")
    expect(result.hasCycle).toBe(true)
    expect(result.cycle).toEqual(["A"])
  })

  it("detects cycle on third edge of 3-node chain", () => {
    // A depends on B, B depends on C — now try C depends on A
    const subtasks = [
      makeSubTask("A", ["B"]),
      makeSubTask("B", ["C"]),
      makeSubTask("C"),
    ]

    const result = hasCycle(subtasks, "C", "A")
    expect(result.hasCycle).toBe(true)
    expect(result.cycle).toEqual(["A", "B", "C"])
  })

  it("handles empty subtasks array", () => {
    const result = hasCycle([], "A", "B")
    expect(result.hasCycle).toBe(false)
    expect(result.cycle).toEqual([])
  })
})
