import { afterEach, describe, expect, it } from "vitest"

import { GET as getQuestsRoute } from "@/app/api/quests/route"
import {
  buildQuests,
  getNextDailyReset,
  getNextWeeklyReset,
  recordCompletedQuestNotifications,
  type QuestStats,
} from "@/lib/gamification/quests"
import { listUnseenNotifications, resetNotificationStore } from "@/lib/notifications/notification-store"

const completeStats: QuestStats = {
  tasksCompletedToday: 5,
  paymentsProcessedToday: 1,
  uptimePercentToday: 99,
  messagesSentToday: 10,
  tasksCompletedWeek: 50,
  xlmEarnedWeek: 1,
  leaderboardRank: 8,
  marketplaceServicesWeek: 1,
  zkPassportsMinted: 1,
  crossDistrictDelegations: 1,
  subscriptionsAcquired: 1,
}

afterEach(() => {
  resetNotificationStore()
})

describe("quests", () => {
  it("sets daily reset to the next UTC midnight", () => {
    expect(getNextDailyReset(new Date("2026-06-26T13:45:00.000Z")).toISOString()).toBe("2026-06-27T00:00:00.000Z")
  })

  it("sets weekly reset to Sunday midnight UTC", () => {
    expect(getNextWeeklyReset(new Date("2026-06-26T13:45:00.000Z")).toISOString()).toBe("2026-06-28T00:00:00.000Z")
  })

  it("builds daily, weekly, and story quests with rewards and completion state", () => {
    const quests = buildQuests(completeStats, new Date("2026-06-26T13:45:00.000Z"))

    expect(quests).toHaveLength(11)
    expect(quests.map((quest) => quest.type)).toContain("daily")
    expect(quests.map((quest) => quest.type)).toContain("weekly")
    expect(quests.map((quest) => quest.type)).toContain("story")
    expect(quests.every((quest) => quest.progress === 100)).toBe(true)
    expect(quests.every((quest) => quest.completedAt)).toBe(true)
    expect(quests.find((quest) => quest.id === "daily-complete-5-tasks")?.reward).toMatchObject({ xp: 50, xlm: "0.05" })
  })

  it("includes optional minimum reputation requirements", () => {
    const quests = buildQuests(completeStats, new Date("2026-06-26T13:45:00.000Z"))

    expect(quests.find((quest) => quest.id === "weekly-onboard-marketplace-service")?.minReputation).toBe(50)
    expect(quests.find((quest) => quest.id === "daily-complete-5-tasks")?.minReputation).toBeUndefined()
  })

  it("keeps incomplete quest progress clamped between zero and one hundred", () => {
    const quests = buildQuests({ ...completeStats, tasksCompletedToday: 2, subscriptionsAcquired: 0 })

    expect(quests.find((quest) => quest.id === "daily-complete-5-tasks")?.progress).toBe(40)
    expect(quests.find((quest) => quest.id === "story-first-subscription")?.progress).toBe(0)
  })

  it("generates quest completed notifications for completed quests", () => {
    const quests = buildQuests(completeStats, new Date("2026-06-26T13:45:00.000Z"))

    recordCompletedQuestNotifications("quest-agent", quests)

    expect(listUnseenNotifications("quest-agent", { limit: 20 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "quest-agent",
          type: "quest_completed",
          resourceHref: "/?quest=daily-complete-5-tasks",
        }),
      ]),
    )
  })

  it("does not generate quest notifications from the read-only quests API", async () => {
    const res = await getQuestsRoute(new Request("http://localhost/api/quests?agentId=quest-route-agent"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.quests.length).toBeGreaterThan(0)
    expect(listUnseenNotifications("quest-route-agent")).toEqual([])
  })
})
