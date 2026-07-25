import { afterEach, describe, expect, it } from "vitest"
import { GET as getGraph } from "@/app/api/quests/[id]/subtasks/graph/route"
import { resetQuestStore, seedQuestSubtasks } from "@/lib/quests"

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

afterEach(() => {
  resetQuestStore()
})

describe("GET /api/quests/[id]/subtasks/graph", () => {
  it("returns nodes and edges for a 3-node graph with 2 edges", async () => {
    seedQuestSubtasks("quest-1", [
      { id: "A", title: "Implement auth", status: "completed", dependsOn: [] },
      { id: "B", title: "Implement dashboard", status: "in_progress", dependsOn: ["A"] },
      { id: "C", title: "Add analytics", status: "todo", dependsOn: ["A"] },
    ])

    const res = await getGraph(new Request("http://localhost/api/quests/quest-1/subtasks/graph"), context("quest-1"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.questId).toBe("quest-1")
    expect(Array.isArray(data.nodes)).toBe(true)
    expect(data.nodes).toHaveLength(3)
    expect(data.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "A", title: "Implement auth", status: "completed" }),
        expect.objectContaining({ id: "B", title: "Implement dashboard", status: "in_progress" }),
        expect.objectContaining({ id: "C", title: "Add analytics", status: "todo" }),
      ]),
    )

    expect(Array.isArray(data.edges)).toBe(true)
    expect(data.edges).toHaveLength(2)
    expect(data.edges).toEqual(
      expect.arrayContaining([
        { from: "A", to: "B" },
        { from: "A", to: "C" },
      ]),
    )

    expect(data.hasCycle).toBe(false)
  })
})
