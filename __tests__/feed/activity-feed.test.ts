import { describe, expect, it } from "vitest"
import { GET as getFeed } from "@/app/api/feed/route"
import { feedEventFromSystemEvent, getFeedEventById, listFeedEvents } from "@/lib/feed/activity-feed"
import { publishSystemEvent } from "@/lib/events/system-events"

async function readStreamText(res: Response, publish: () => void) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("missing response stream")

  const first = await reader.read()
  publish()
  const second = await reader.read()
  await reader.cancel()

  return new TextDecoder().decode(first.value) + new TextDecoder().decode(second.value)
}

describe("activity feed", () => {
  it("lists seeded feed events with filters", () => {
    const all = listFeedEvents()
    const payments = listFeedEvents({ kind: "payment" })
    const dataCenter = listFeedEvents({ district: "data-center" })

    expect(all.length).toBeGreaterThan(4)
    expect(payments.every((event) => event.kind === "payment")).toBe(true)
    expect(dataCenter.every((event) => event.districtId === "data-center")).toBe(true)
  })

  it("finds event details by id", () => {
    const [first] = listFeedEvents()
    expect(getFeedEventById(first.id)?.title).toBe(first.title)
  })

  it("paginates seeded events with a cursor", () => {
    const firstPage = listFeedEvents({ limit: 2 })
    const secondPage = listFeedEvents({ limit: 2, cursor: firstPage.at(-1)?.occurredAt })

    expect(firstPage).toHaveLength(2)
    expect(secondPage).toHaveLength(2)
    expect(secondPage[0].id).not.toBe(firstPage[0].id)
  })

  it("normalizes live system events for the feed stream", () => {
    const event = feedEventFromSystemEvent({
      id: "evt_1",
      type: "agent.xp",
      agentId: "bot-0",
      xp: 120,
      level: 9,
      occurredAt: "2026-06-24T00:00:00.000Z",
    })

    expect(event.kind).toBe("level-up")
    expect(event.title).toContain("Level 9")
    expect(event.agentName).toBe("Nexus-7")
  })

  it("normalizes quest completion events with quest and reward details", () => {
    const event = feedEventFromSystemEvent({
      id: "quest-event-1",
      type: "quest.completed",
      agentId: "bot-0",
      questId: "daily-complete-5-tasks",
      quest: {
        id: "daily-complete-5-tasks",
        title: "Complete 5 tasks",
      },
      reward: {
        xp: 50,
        xlm: "0.05",
      },
      occurredAt: "2026-06-24T00:00:00.000Z",
    })

    expect(event.kind).toBe("task")
    expect(event.title).toBe("Nexus-7 completed Complete 5 tasks")
    expect(event.detail).toContain("+50 XP")
    expect(event.detail).toContain("0.05 XLM")
    expect(event.highlight).toBe("Quest completed")
  })

  it("serves JSON feed API responses", async () => {
    const res = await getFeed(new Request("http://localhost/api/feed?kind=payment&limit=1"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.events).toHaveLength(1)
    expect(body.events[0].kind).toBe("payment")
    expect(body.nextCursor).toBeTruthy()
  })

  it("streams normalized feed events over SSE", async () => {
    const res = getFeed(new Request("http://localhost/api/feed?stream=1"))
    const text = await readStreamText(res, () => {
      publishSystemEvent({
        id: "feed-test-event",
        type: "badge.unlocked",
        agentId: "bot-3",
        badge: { id: "speed-demon", name: "Speed Demon", rarity: "rare" },
        occurredAt: "2026-06-24T00:00:00.000Z",
      })
    })

    expect(text).toContain("event: feed.event")
    expect(text).toContain('"kind":"badge"')
    expect(text).toContain("Speed Demon")
  })

  it("streams quest completion events over the activity feed SSE endpoint", async () => {
    const res = getFeed(new Request("http://localhost/api/feed?stream=1"))
    const text = await readStreamText(res, () => {
      publishSystemEvent({
        id: "feed-quest-completed",
        type: "quest.completed",
        agentId: "bot-0",
        questId: "daily-complete-5-tasks",
        quest: {
          id: "daily-complete-5-tasks",
          title: "Complete 5 tasks",
        },
        reward: {
          xp: 50,
          xlm: "0.05",
        },
        occurredAt: "2026-06-24T00:00:00.000Z",
      })
    })

    expect(text).toContain("event: feed.event")
    expect(text).toContain('"id":"feed-quest-completed"')
    expect(text).toContain("Nexus-7 completed Complete 5 tasks")
    expect(text).toContain("+50 XP")
    expect(text).toContain("0.05 XLM")
  })
})
