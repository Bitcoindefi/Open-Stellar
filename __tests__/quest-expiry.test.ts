import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  resetQuestStore,
  seedQuest,
  runQuestExpiryCheck,
  setQuestExpired,
  getStoredQuest,
  listStoredQuests,
} from "@/lib/gamification/quest-store"
import { resetNotificationStore, listUnseenNotifications } from "@/lib/notifications/notification-store"

describe("quest expiry", () => {
  beforeEach(() => {
    resetQuestStore()
    resetNotificationStore()
  })

  afterEach(() => {
    resetQuestStore()
    resetNotificationStore()
  })

  it("creates a quest with optional expiresAt", () => {
    const quest = seedQuest({
      id: "test-quest-1",
      title: "Test",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      assignedAgentIds: ["agent-1"],
    })

    expect(quest.expiresAt).toBeDefined()
    expect(quest.status).toBe("in_progress")
    expect(getStoredQuest("test-quest-1")).not.toBeNull()
  })

  it("defaults expiresAt to null when not provided", () => {
    const quest = seedQuest({ id: "test-quest-2", title: "No expiry" })
    expect(quest.expiresAt).toBeNull()
  })

  it("cron marks past-deadline quests as expired", () => {
    const past = new Date(Date.now() - 1).toISOString()
    seedQuest({
      id: "expired-quest",
      title: "Stale quest",
      expiresAt: past,
      assignedAgentIds: ["agent-a"],
    })

    const result = runQuestExpiryCheck()

    expect(result.expired).toBe(1)
    expect(result.checked).toBe(1)

    const quest = getStoredQuest("expired-quest")
    expect(quest?.status).toBe("expired")
  })

  it("skips already completed quests in cron", () => {
    const past = new Date(Date.now() - 1).toISOString()
    seedQuest({
      id: "completed-quest",
      title: "Done quest",
      expiresAt: past,
      status: "completed",
      assignedAgentIds: ["agent-b"],
    })

    const result = runQuestExpiryCheck()
    expect(result.expired).toBe(0)

    const quest = getStoredQuest("completed-quest")
    expect(quest?.status).toBe("completed")
  })

  it("skips already expired quests in cron (idempotent)", () => {
    const past = new Date(Date.now() - 1).toISOString()
    seedQuest({
      id: "already-expired",
      title: "Already expired",
      expiresAt: past,
      status: "expired",
      assignedAgentIds: ["agent-c"],
    })

    const result = runQuestExpiryCheck()
    expect(result.expired).toBe(0)
  })

  it("skips quests without expiresAt", () => {
    seedQuest({
      id: "no-expiry",
      title: "Permanent quest",
      assignedAgentIds: ["agent-d"],
    })

    const result = runQuestExpiryCheck()
    expect(result.expired).toBe(0)
    expect(getStoredQuest("no-expiry")?.status).toBe("in_progress")
  })

  it("emits quest_expired notification to subscribed agents", () => {
    const past = new Date(Date.now() - 1).toISOString()
    seedQuest({
      id: "notify-quest",
      title: "Notify me",
      expiresAt: past,
      assignedAgentIds: ["agent-1", "agent-2"],
    })

    const result = runQuestExpiryCheck()
    expect(result.expired).toBe(1)
    expect(result.notified).toBe(2)

    const agent1Notes = listUnseenNotifications("agent-1")
    expect(agent1Notes.length).toBeGreaterThan(0)
    expect(agent1Notes[0].type).toBe("quest_expired")
    expect(agent1Notes[0].body).toContain("Notify me")

    const agent2Notes = listUnseenNotifications("agent-2")
    expect(agent2Notes.length).toBeGreaterThan(0)
    expect(agent2Notes[0].type).toBe("quest_expired")
  })

  it("excludes expired quests from default list", () => {
    seedQuest({ id: "active-quest", title: "Active", status: "in_progress" })
    seedQuest({ id: "expired-quest", title: "Expired", status: "expired" })

    const list = listStoredQuests()
    expect(list.some((q) => q.id === "active-quest")).toBe(true)
    expect(list.some((q) => q.id === "expired-quest")).toBe(false)
  })

  it("includes expired quests when includeExpired is true", () => {
    seedQuest({ id: "active-quest-2", title: "Active", status: "in_progress" })
    seedQuest({ id: "expired-quest-2", title: "Expired", status: "expired" })

    const list = listStoredQuests({ includeExpired: true })
    expect(list.some((q) => q.id === "active-quest-2")).toBe(true)
    expect(list.some((q) => q.id === "expired-quest-2")).toBe(true)
  })

  it("unit: create quest expiring 1ms ago -> cron marks expired -> notification emitted", () => {
    const oneMsAgo = new Date(Date.now() - 1).toISOString()
    seedQuest({
      id: "e2e-expired",
      title: "E2E expired quest",
      expiresAt: oneMsAgo,
      assignedAgentIds: ["e2e-agent"],
    })

    // Pre-cron: quest is in_progress
    expect(getStoredQuest("e2e-expired")?.status).toBe("in_progress")

    // Run cron
    const result = runQuestExpiryCheck()
    expect(result.expired).toBe(1)

    // Post-cron: quest is expired
    expect(getStoredQuest("e2e-expired")?.status).toBe("expired")

    // Notification emitted
    const notes = listUnseenNotifications("e2e-agent")
    expect(notes.some((n) => n.type === "quest_expired" && n.title === "Quest expired")).toBe(true)
  })
})