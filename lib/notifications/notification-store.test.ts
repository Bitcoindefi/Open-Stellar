import { afterEach, describe, expect, it } from "vitest"

import {
  NOTIFICATION_TYPES,
  addNotification,
  listUnseenNotifications,
  resetNotificationStore,
} from "@/lib/notifications/notification-store"
import {
  resetNotificationPreferences,
  setNotificationPreferences,
} from "@/lib/notifications/notification-preferences"

afterEach(() => {
  resetNotificationStore()
  resetNotificationPreferences()
})

describe("notification store", () => {
  it("stores supported notification types", () => {
    expect(NOTIFICATION_TYPES).toEqual(["agent_offline", "quest_completed", "reputation_updated", "quest_expired"])
  })

  it("keeps only the latest 50 notifications per agent and drops the oldest", () => {
    for (let index = 0; index < 60; index += 1) {
      addNotification({
        agentId: "agent-retention",
        type: "quest_completed",
        title: `Quest ${index}`,
        body: `Completed quest ${index}`,
        resourceHref: `/quests/quest-${index}`,
        resourceLabel: `quest-${index}`,
        createdAt: new Date(Date.UTC(2026, 5, 26, 12, index)).toISOString(),
      })
    }

    const notifications = listUnseenNotifications("agent-retention", { limit: 60 })

    expect(notifications).toHaveLength(50)
    expect(notifications[0].title).toBe("Quest 59")
    expect(notifications.at(-1)?.title).toBe("Quest 10")
  })

  it("does not store a muted notification type", () => {
    setNotificationPreferences("agent-muted", ["agent_offline"])

    const notification = addNotification({
      agentId: "agent-muted",
      type: "agent_offline",
      title: "Offline",
      body: "Agent went offline",
      resourceHref: "/agents/agent-muted",
      resourceLabel: "Agent",
    })

    expect(notification).toBeNull()
    expect(listUnseenNotifications("agent-muted")).toEqual([])
  })

  it("stores a notification type again after it is unmuted", () => {
    setNotificationPreferences("agent-unmuted", ["agent_offline"])
    setNotificationPreferences("agent-unmuted", [])

    const notification = addNotification({
      agentId: "agent-unmuted",
      type: "agent_offline",
      title: "Offline",
      body: "Agent went offline",
      resourceHref: "/agents/agent-unmuted",
      resourceLabel: "Agent",
    })

    expect(notification?.type).toBe("agent_offline")
    expect(listUnseenNotifications("agent-unmuted")).toHaveLength(1)
  })

  it("continues storing other types when one type is muted", () => {
    setNotificationPreferences("agent-selective", ["agent_offline"])

    addNotification({
      agentId: "agent-selective",
      type: "agent_offline",
      title: "Offline",
      body: "Agent went offline",
      resourceHref: "/agents/agent-selective",
      resourceLabel: "Agent",
    })
    addNotification({
      agentId: "agent-selective",
      type: "quest_completed",
      title: "Quest complete",
      body: "Agent completed a quest",
      resourceHref: "/?quest=quest-1",
      resourceLabel: "Quest",
    })

    expect(listUnseenNotifications("agent-selective").map((notification) => notification.type)).toEqual([
      "quest_completed",
    ])
  })
})
