import { afterEach, describe, expect, it } from "vitest"

import { GET, POST } from "@/app/api/notifications/route"
import { addNotification, resetNotificationStore } from "@/lib/notifications/notification-store"

afterEach(() => {
  resetNotificationStore()
})

describe("GET /api/notifications", () => {
  it("returns up to 20 unseen notifications for the requested agent", async () => {
    for (let index = 0; index < 25; index += 1) {
      addNotification({
        agentId: "agent-api",
        type: "reputation_updated",
        title: `Reputation ${index}`,
        body: `Score changed ${index}`,
        resourceHref: "/leaderboard/agent-api",
        resourceLabel: "Reputation",
        createdAt: new Date(Date.UTC(2026, 5, 26, 13, index)).toISOString(),
      })
    }
    addNotification({
      agentId: "other-agent",
      type: "agent_offline",
      title: "Other offline",
      body: "Other agent went offline",
      resourceHref: "/agents/other-agent",
      resourceLabel: "Agent",
    })

    const res = await GET(new Request("http://localhost/api/notifications?agentId=agent-api"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.unreadCount).toBe(25)
    expect(data.notifications).toHaveLength(20)
    expect(data.notifications[0].title).toBe("Reputation 24")
    expect(data.notifications.at(-1).title).toBe("Reputation 5")
    expect(data.nextCursor).toBe("25")
    expect(data.notifications.every((notification: { agentId: string }) => notification.agentId === "agent-api")).toBe(true)
  })

  it("returns only notifications newer than the since cursor", async () => {
    const first = addNotification({
      agentId: "agent-cursor",
      type: "agent_offline",
      title: "First",
      body: "First alert",
      resourceHref: "/agents/agent-cursor",
      resourceLabel: "Agent",
    })
    addNotification({
      agentId: "agent-cursor",
      type: "quest_completed",
      title: "Second",
      body: "Second alert",
      resourceHref: "/?quest=second",
      resourceLabel: "Quest",
    })
    addNotification({
      agentId: "agent-cursor",
      type: "reputation_updated",
      title: "Third",
      body: "Third alert",
      resourceHref: "/leaderboard/agent-cursor",
      resourceLabel: "Reputation",
    })

    const res = await GET(new Request(`http://localhost/api/notifications?agentId=agent-cursor&since=${first?.cursor}`))
    const data = await res.json()

    expect(data.unreadCount).toBe(3)
    expect(data.nextCursor).toBe("3")
    expect(data.notifications.map((notification: { title: string }) => notification.title)).toEqual(["Third", "Second"])
  })

  it("clamps limit safely", async () => {
    for (let index = 0; index < 55; index += 1) {
      addNotification({
        agentId: "agent-limit",
        type: "quest_completed",
        title: `Quest ${index}`,
        body: `Quest alert ${index}`,
        resourceHref: `/?quest=${index}`,
        resourceLabel: "Quest",
      })
    }

    const smallLimit = await GET(new Request("http://localhost/api/notifications?agentId=agent-limit&limit=2"))
    const smallLimitData = await smallLimit.json()
    const largeLimit = await GET(new Request("http://localhost/api/notifications?agentId=agent-limit&limit=200"))
    const largeLimitData = await largeLimit.json()

    expect(smallLimitData.notifications).toHaveLength(2)
    expect(smallLimitData.notifications.map((notification: { title: string }) => notification.title)).toEqual(["Quest 54", "Quest 53"])
    expect(largeLimitData.notifications).toHaveLength(50)
    expect(largeLimitData.notifications[0].title).toBe("Quest 54")
    expect(largeLimitData.notifications.at(-1).title).toBe("Quest 5")
  })

  it("requires agentId", async () => {
    const res = await GET(new Request("http://localhost/api/notifications"))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
  })
})

describe("POST /api/notifications", () => {
  it("marks all notifications read for an agent", async () => {
    addNotification({
      agentId: "agent-read",
      type: "agent_offline",
      title: "Offline",
      body: "Agent is offline",
      resourceHref: "/agents/agent-read",
      resourceLabel: "Agent",
    })

    const markRead = await POST(new Request("http://localhost/api/notifications", {
      method: "POST",
      body: JSON.stringify({ agentId: "agent-read" }),
      headers: { "Content-Type": "application/json" },
    }))
    const markReadData = await markRead.json()

    expect(markRead.status).toBe(200)
    expect(markReadData.ok).toBe(true)
    expect(markReadData.markedRead).toBe(1)

    const res = await GET(new Request("http://localhost/api/notifications?agentId=agent-read"))
    const data = await res.json()

    expect(data.unreadCount).toBe(0)
    expect(data.notifications).toEqual([])
  })
})
