import { afterEach, describe, expect, it } from "vitest"

import { GET } from "@/app/api/quests/[id]/chain/route"
import {
  getStoredQuest,
  resetQuestStore,
  seedQuest,
  updateQuestStatus,
} from "@/lib/gamification/quest-store"
import {
  subscribeToSystemEvents,
  type PublishedSystemEvent,
} from "@/lib/events/system-events"

const context = (id: string) => ({ params: Promise.resolve({ id }) })

afterEach(() => {
  resetQuestStore()
})

describe("GET /api/quests/[id]/chain", () => {
  it("returns a terminal quest as a one-item chain", async () => {
    seedQuest({ id: "quest-terminal" })

    const response = await GET(
      new Request("http://localhost/api/quests/quest-terminal/chain"),
      context("quest-terminal"),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      chain: ["quest-terminal"],
      length: 1,
    })
  })

  it("returns the full forward quest chain", async () => {
    seedQuest({ id: "quest-a", unlocksQuestId: "quest-b" })
    seedQuest({ id: "quest-b", unlocksQuestId: "quest-c" })
    seedQuest({ id: "quest-c" })

    const response = await GET(
      new Request("http://localhost/api/quests/quest-a/chain"),
      context("quest-a"),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      chain: ["quest-a", "quest-b", "quest-c"],
      length: 3,
    })
  })

  it("returns 400 when the chain contains a cycle", async () => {
    seedQuest({ id: "quest-a", unlocksQuestId: "quest-b" })
    seedQuest({ id: "quest-b", unlocksQuestId: "quest-a" })

    const response = await GET(
      new Request("http://localhost/api/quests/quest-a/chain"),
      context("quest-a"),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: "cycle_detected",
    })
  })

  it("returns the existing quest not-found shape", async () => {
    const response = await GET(
      new Request("http://localhost/api/quests/missing/chain"),
      context("missing"),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      ok: false,
      error: "Quest not found",
    })
  })
})

describe("quest completion unlocks", () => {
  it("emits exactly one quest.unlocked event and assigns the unlocked quest", () => {
    seedQuest({
      id: "quest-a",
      unlocksQuestId: "quest-b",
      assignedAgentIds: ["agent-1"],
    })
    seedQuest({ id: "quest-b" })
    const events: PublishedSystemEvent[] = []
    const unsubscribe = subscribeToSystemEvents((event) => events.push(event))

    updateQuestStatus("quest-a", "completed")
    updateQuestStatus("quest-a", "completed")
    unsubscribe()

    expect(
      events
        .filter((event) => event.type === "quest.unlocked")
        .map((event) => ({
          type: event.type,
          agentId: event.agentId,
          questId: event.questId,
        })),
    ).toEqual([
      {
        type: "quest.unlocked",
        agentId: "agent-1",
        questId: "quest-b",
      },
    ])
    expect(getStoredQuest("quest-b")?.assignedAgentIds).toEqual(["agent-1"])
  })

  it("preserves completion behavior for a quest without unlock metadata", () => {
    seedQuest({ id: "quest-standalone", assignedAgentIds: ["agent-1"] })
    const events: PublishedSystemEvent[] = []
    const unsubscribe = subscribeToSystemEvents((event) => events.push(event))

    const completed = updateQuestStatus("quest-standalone", "completed")
    unsubscribe()

    expect(completed?.status).toBe("completed")
    expect(completed?.completedAt).toBeDefined()
    expect(events.filter((event) => event.type === "quest.unlocked")).toEqual([])
  })
})
