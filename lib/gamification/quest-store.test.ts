import { describe, it, expect, beforeEach } from 'vitest'
import {
  createQuest,
  getStoredQuest,
  updateQuestStatus,
  resetQuestStore
} from './quest-store'

describe('Quest Store', () => {
  beforeEach(() => {
    resetQuestStore()
  })

  it('creates and retrieves a quest', () => {
    const quest = createQuest({
      id: 'test-quest',
      type: 'daily',
      title: 'Test Quest',
      description: 'A test quest',
      reward: { xp: 10 }
    })
    
    expect(quest.id).toBe('test-quest')
    expect(quest.status).toBe('in_progress')
    
    const retrieved = getStoredQuest('test-quest')
    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe('test-quest')
  })

  it('updates quest status', () => {
    createQuest({
      id: 'test-quest-2',
      type: 'daily',
      title: 'Test Quest 2',
      description: 'A test quest',
      reward: { xp: 10 }
    })
    
    updateQuestStatus('test-quest-2', 'completed')
    
    const retrieved = getStoredQuest('test-quest-2')
    expect(retrieved?.status).toBe('completed')
    expect(retrieved?.completedAt).toBeDefined()
  })
})
