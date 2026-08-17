import { describe, expect, it } from "vitest"

import { createToastFromSystemEvent } from "@/lib/notifications/system-toast-events"

describe("system toast events", () => {
  it("creates a success toast for level-up XP events", () => {
    const toast = createToastFromSystemEvent({
      id: "evt-level-up",
      occurredAt: "2026-07-16T10:00:00.000Z",
      type: "agent.xp",
      agentId: "agent-1",
      xp: 100,
      totalXp: 100,
      level: 2,
      previousLevel: 1,
      xpToNext: 250,
      reason: "task.completed",
      leveledUp: true,
    })

    expect(toast).toEqual({
      id: "level-up:evt-level-up",
      title: "Level up!",
      message: "You're now Level 2",
      tone: "success",
    })
  })

  it("ignores XP events that do not cross a level threshold", () => {
    const toast = createToastFromSystemEvent({
      id: "evt-xp",
      occurredAt: "2026-07-16T10:00:00.000Z",
      type: "agent.xp",
      agentId: "agent-1",
      xp: 10,
      totalXp: 10,
      level: 1,
      previousLevel: 1,
      xpToNext: 100,
      reason: "task.completed",
      leveledUp: false,
    })

    expect(toast).toBeNull()
  })

  it("creates a success toast for quest completion events", () => {
    const toast = createToastFromSystemEvent({
      id: "evt-quest",
      occurredAt: "2026-07-16T10:00:00.000Z",
      type: "quest.completed",
      agentId: "agent-1",
      questId: "quest-1",
      questTitle: "Complete 5 tasks",
      reward: { xp: 50 },
    })

    expect(toast).toEqual({
      id: "quest-complete:evt-quest",
      title: "Quest complete",
      message: "Complete 5 tasks (+50 XP)",
      tone: "success",
    })
  })
})
