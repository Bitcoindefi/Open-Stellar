import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { PATCH } from "@/app/api/quests/[id]/subtasks/[subtaskId]/route"
import { addSubTask, getSubTasks, type Quest } from "@/lib/gamification/quests"

// Mock getQuestById to return a valid quest for our test IDs
vi.mock("@/lib/gamification/quests", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gamification/quests")>("@/lib/gamification/quests")
  return {
    ...actual,
    getQuestById: (id: string): Quest | null => {
      // Return a mock quest for any test quest ID
      if (id.startsWith("test-quest") || id === "diamond-quest") {
        return {
          id,
          type: "daily",
          title: "Test Quest",
          description: "Test",
          reward: { xp: 10 },
          progress: 0,
          status: "in_progress",
        } as Quest
      }
      return actual.getQuestById(id)
    },
  }
})

function resetSubTasks() {
  const globalQuests = globalThis as typeof globalThis & {
    __openStellarQuestSubTasks__?: Map<string, ReturnType<typeof getSubTasks>>
  }
  globalQuests.__openStellarQuestSubTasks__ = new Map()
}

function createContext(questId: string, subtaskId: string) {
  return { params: Promise.resolve({ id: questId, subtaskId }) }
}

describe("PATCH /api/quests/[id]/subtasks/[subtaskId] — cycle detection", () => {
  const questId = "test-quest-cycle"

  beforeEach(() => {
    resetSubTasks()
  })

  it("returns 422 when setting B.dependsOn=[A] creates a 2-node cycle", async () => {
    const a = addSubTask(questId, "Task A")
    const b = addSubTask(questId, "Task B")

    // Set A depends on B
    const req1 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [b.id] }),
    })
    const res1 = await PATCH(req1, createContext(questId, a.id))
    expect(res1.status).toBe(200)

    // Now try B depends on A — should be rejected
    const req2 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [a.id] }),
    })
    const res = await PATCH(req2, createContext(questId, b.id))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe("circular_dependency")
    expect(body.cycle).toBeDefined()
    expect(body.cycle).toContain(a.id)
    expect(body.cycle).toContain(b.id)
  })

  it("returns 422 on 3-node cycle A->B->C->A", async () => {
    const a = addSubTask(questId, "Task A")
    const b = addSubTask(questId, "Task B")
    const c = addSubTask(questId, "Task C")

    // Set A -> B
    const req1 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [b.id] }),
    })
    const res1 = await PATCH(req1, createContext(questId, a.id))
    expect(res1.status).toBe(200)

    // Set B -> C
    const req2 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [c.id] }),
    })
    const res2 = await PATCH(req2, createContext(questId, b.id))
    expect(res2.status).toBe(200)

    // Now try C -> A — should be rejected (3-node cycle)
    const req3 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [a.id] }),
    })
    const res = await PATCH(req3, createContext(questId, c.id))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe("circular_dependency")
    expect(body.cycle).toEqual([a.id, b.id, c.id])
  })

  it("allows diamond dependency without false positive", async () => {
    const diamondQuest = "diamond-quest"
    const d = addSubTask(diamondQuest, "D")
    const e = addSubTask(diamondQuest, "E")
    const f = addSubTask(diamondQuest, "F")
    const g = addSubTask(diamondQuest, "G")

    // D -> E, D -> F
    const req1 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [e.id, f.id] }),
    })
    const res1 = await PATCH(req1, createContext(diamondQuest, d.id))
    expect(res1.status).toBe(200)

    // E -> G
    const req2 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [g.id] }),
    })
    const res2 = await PATCH(req2, createContext(diamondQuest, e.id))
    expect(res2.status).toBe(200)

    // F -> G (valid diamond — no cycle)
    const req3 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [g.id] }),
    })
    const res3 = await PATCH(req3, createContext(diamondQuest, f.id))

    expect(res3.status).toBe(200)
    const body = await res3.json()
    expect(body.ok).toBe(true)
  })

  it("cycle array names the actual IDs forming the loop", async () => {
    const a = addSubTask(questId, "Task A")
    const b = addSubTask(questId, "Task B")

    // Set A -> B
    const req1 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [b.id] }),
    })
    const res1 = await PATCH(req1, createContext(questId, a.id))
    expect(res1.status).toBe(200)

    // Try B -> A
    const req2 = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOn: [a.id] }),
    })
    const res = await PATCH(req2, createContext(questId, b.id))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(Array.isArray(body.cycle)).toBe(true)
    expect(body.cycle).toContain(a.id)
    expect(body.cycle).toContain(b.id)
    expect(body.cycle.length).toBeGreaterThanOrEqual(2)
  })
})
