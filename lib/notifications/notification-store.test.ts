import { afterEach, describe, expect, it } from "vitest"

import {
  NOTIFICATION_TYPES,
  addNotification,
  listUnseenNotifications,
  resetNotificationStore,
} from "@/lib/notifications/notification-store"

afterEach(() => {
  resetNotificationStore()
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
})