import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { readQuestProgress, writeQuestProgress, resetQuestProgressStoreForTests, getDbPath } from "@/lib/gamification/quest-persistence"
import { createQuest, listStoredQuests } from "@/lib/gamification/quest-store"
import { markQuestClaimed, hasClaimedQuest } from "@/lib/gamification/quest-completions"
import { addSubTask, getSubTasks } from "@/lib/gamification/quests"
import fs from "node:fs"

describe("Quest Persistence", () => {
  beforeEach(() => {
    // Clear out test db before each test
    if (fs.existsSync(getDbPath())) {
      fs.unlinkSync(getDbPath())
    }
    resetQuestProgressStoreForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("Quest progress survives a server restart (process mock)", () => {
    // Simulate initial process
    createQuest({
      id: "restart-quest-1",
      title: "Test Restart",
      description: "Desc",
      type: "story",
      reward: { xp: 10 }
    })
    
    // Add subtasks
    addSubTask("restart-quest-1", "Step 1", "agent-x")
    
    // Mark claimed
    markQuestClaimed("restart-quest-1", "agent-x")
    
    // Verify it's in memory via standard API
    expect(listStoredQuests().length).toBeGreaterThan(0)
    expect(hasClaimedQuest("restart-quest-1", "agent-x")).toBe(true)
    expect(getSubTasks("restart-quest-1").length).toBe(1)

    // SIMULATE SERVER RESTART by reading directly from file as a new process would
    // and verifying the memory state is cleared but correctly hydrated.
    // In our implementation, `readQuestProgress` parses from disk every time it's called.
    const freshRead = readQuestProgress()
    
    expect(freshRead.quests.some(q => q.id === "restart-quest-1")).toBe(true)
    expect(freshRead.quests.find(q => q.id === "restart-quest-1")?.subTasks?.length).toBe(1)
    expect(freshRead.completions.some(c => c.questId === "restart-quest-1" && c.actorId === "agent-x")).toBe(true)
  })

  it("Atomic write pattern used (no partial-file corruption)", () => {
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync')
    const renameSyncSpy = vi.spyOn(fs, 'renameSync')
    
    markQuestClaimed("atomic-test-quest", "agent-atomic")
    
    // Assert writeFileSync was called with a .tmp extension
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      expect.any(String),
      'utf8'
    )
    
    // Assert renameSync was called to move .tmp to final .json
    expect(renameSyncSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      expect.stringMatching(/quest-progress\.json$/)
    )
    
    writeFileSyncSpy.mockRestore()
    renameSyncSpy.mockRestore()
  })

  it("Daily quests auto-reset at midnight UTC", () => {
    const today = new Date('2026-06-30T10:00:00.000Z')
    vi.setSystemTime(today)

    createQuest({
      id: "daily-test-1",
      title: "Daily",
      description: "Desc",
      type: "daily",
      reward: { xp: 10 }
    })

    markQuestClaimed("daily-test-1", "agent-1")
    
    expect(hasClaimedQuest("daily-test-1", "agent-1")).toBe(true)
    expect(listStoredQuests().some(q => q.id === "daily-test-1")).toBe(true)

    // Advance time to just before midnight UTC
    vi.setSystemTime(new Date('2026-06-30T23:59:59.000Z'))
    
    // Still claimed
    expect(hasClaimedQuest("daily-test-1", "agent-1")).toBe(true)
    
    // Advance time past midnight UTC
    vi.setSystemTime(new Date('2026-07-01T00:01:00.000Z'))
    
    // A read operation (like listStoredQuests) should trigger the reset
    const quests = listStoredQuests()
    
    // Daily quest is removed from quests map
    expect(quests.some(q => q.id === "daily-test-1")).toBe(false)
    
    // And it can be claimed again!
    expect(hasClaimedQuest("daily-test-1", "agent-1")).toBe(false)
  })
})
