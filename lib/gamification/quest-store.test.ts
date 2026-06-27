import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs'
import {
  questStoreData,
  loadQuestStore
} from './quest-store'
import { addSubTask, updateSubTask, getQuestById } from './quests'

vi.mock('fs', async () => {
  return {
    default: {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
      mkdirSync: vi.fn()
    }
  }
})

describe('Quest Store Persistence', () => {
  let originalConsoleWarn: any;
  let warnMock: any;

  beforeEach(() => {
    questStoreData.quests = []
    questStoreData.questStats = {}
    questStoreData.agentXp = {}
    
    warnMock = vi.fn()
    originalConsoleWarn = console.warn
    console.warn = warnMock

    vi.clearAllMocks()
    
    // Clear global subtask DB state (hacky but works for the test)
    const globalStore = globalThis as any
    if (globalStore.__openStellarQuestSubTasks__) {
      globalStore.__openStellarQuestSubTasks__.clear()
    }
  })

  afterEach(() => {
    console.warn = originalConsoleWarn
  })

  it('completes quest, serializes, and deserializes retaining completed status', () => {
    const questId = 'daily-process-payment'
    const subtask = addSubTask(questId, 'Test payment')
    updateSubTask(questId, subtask.id, { status: 'done' })

    const questBefore = getQuestById(questId)
    expect(questBefore?.status).toBe('completed')
    expect(questStoreData.quests.find(q => q.id === questId)?.status).toBe('completed')

    // Serialize store to string
    const serialized = JSON.stringify(questStoreData)

    // Clear store to simulate restart
    questStoreData.quests = []
    
    // Mock fs
    const fsMock = require('fs').default
    fsMock.existsSync.mockReturnValue(true)
    fsMock.readFileSync.mockReturnValue(serialized)

    const globalStore = globalThis as any
    globalStore.__openStellarQuestStoreLoaded__ = false
    
    loadQuestStore()

    const loadedQuest = questStoreData.quests.find(q => q.id === questId)
    expect(loadedQuest).toBeDefined()
    expect(loadedQuest?.status).toBe('completed')
    expect(loadedQuest?.subTasks?.[0].status).toBe('done')
  })

  it('falls back to empty store and logs warning if data is corrupt', () => {
    const fsMock = require('fs').default
    fsMock.existsSync.mockReturnValue(true)
    fsMock.readFileSync.mockReturnValue('{ invalid json ]')

    const globalStore = globalThis as any
    globalStore.__openStellarQuestStoreLoaded__ = false
    
    loadQuestStore()

    expect(warnMock).toHaveBeenCalledWith(
      'Failed to load quest store, falling back to empty store:',
      expect.any(Error)
    )
    expect(questStoreData.quests).toEqual([])
    expect(questStoreData.questStats).toEqual({})
  })
})
