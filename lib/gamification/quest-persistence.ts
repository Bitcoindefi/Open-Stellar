import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { cwd } from 'node:process'
import type { StoredQuest } from './quest-store'
import { getNextDailyReset } from './quests'

export interface QuestCompletionRecord {
  questId: string
  actorId: string
  claimedAt: string
  questType?: string
}

export interface QuestProgressStore {
  lastResetDate: string
  quests: StoredQuest[]
  completions: QuestCompletionRecord[]
}

const DEFAULT_DB_PATH = join(cwd(), '.data', 'quest-progress.json')

export function getDbPath(): string {
  return process.env.QUEST_DB_PATH || DEFAULT_DB_PATH
}

function ensureDb(): void {
  const dbPath = getDbPath()
  const dir = dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (!fs.existsSync(dbPath)) {
    const initial: QuestProgressStore = {
      lastResetDate: new Date().toISOString(),
      quests: [],
      completions: []
    }
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2) + '\n', 'utf8')
  }
}

export function readQuestProgress(): QuestProgressStore {
  ensureDb()
  const dbPath = getDbPath()
  const raw = fs.readFileSync(dbPath, 'utf8').trim()
  
  if (!raw) {
    return { lastResetDate: new Date().toISOString(), quests: [], completions: [] }
  }
  
  let store: QuestProgressStore
  try {
    store = JSON.parse(raw) as QuestProgressStore
  } catch (err) {
    throw new Error(`Failed to parse quest progress database: ${err}`)
  }

  // Handle auto-reset
  let needsSave = false
  const now = new Date()
  const lastReset = new Date(store.lastResetDate)
  const nextReset = getNextDailyReset(lastReset)
  
  if (now.getTime() >= nextReset.getTime()) {
    // Remove daily quests from the stored quests map
    store.quests = store.quests.filter(q => q.type !== 'daily')
    
    store.lastResetDate = now.toISOString()
    needsSave = true
  }

  if (needsSave) {
    writeQuestProgress(store)
  }

  return store
}

export function writeQuestProgress(store: QuestProgressStore): void {
  ensureDb()
  const dbPath = getDbPath()
  const tmpPath = `${dbPath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  fs.renameSync(tmpPath, dbPath)
}

export function resetQuestProgressStoreForTests(): void {
  const dbPath = getDbPath()
  const dir = dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const initial: QuestProgressStore = {
    lastResetDate: new Date().toISOString(),
    quests: [],
    completions: []
  }
  fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2) + '\n', 'utf8')
}
