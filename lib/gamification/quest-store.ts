import fs from 'fs'
import path from 'path'
import type { Quest, QuestStats } from './quests'
import type { AgentXPRecord } from './xp'

export interface QuestStoreData {
  quests: Quest[]
  questStats: Record<string, QuestStats>
  agentXp: Record<string, AgentXPRecord>
  lastUpdated: string
}

const STORE_PATH = path.join(process.cwd(), '.data', 'quests.json')
const TMP_STORE_PATH = path.join(process.cwd(), '.data', 'quests.json.tmp')

const globalStore = globalThis as typeof globalThis & {
  __openStellarQuestStore__?: QuestStoreData
  __openStellarQuestStoreLoaded__?: boolean
}

if (!globalStore.__openStellarQuestStore__) {
  globalStore.__openStellarQuestStore__ = {
    quests: [],
    questStats: {},
    agentXp: {},
    lastUpdated: new Date().toISOString(),
  }
}

export const questStoreData = globalStore.__openStellarQuestStore__

export function loadQuestStore() {
  if (globalStore.__openStellarQuestStoreLoaded__) return
  globalStore.__openStellarQuestStoreLoaded__ = true

  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = fs.readFileSync(STORE_PATH, 'utf-8')
      const parsed = JSON.parse(data) as QuestStoreData
      
      questStoreData.quests = parsed.quests || []
      questStoreData.questStats = parsed.questStats || {}
      questStoreData.agentXp = parsed.agentXp || {}
      questStoreData.lastUpdated = parsed.lastUpdated || new Date().toISOString()
    }
  } catch (error) {
    console.warn('Failed to load quest store, falling back to empty store:', error)
    questStoreData.quests = []
    questStoreData.questStats = {}
    questStoreData.agentXp = {}
    questStoreData.lastUpdated = new Date().toISOString()
  }
}

export function persistQuestStore() {
  questStoreData.lastUpdated = new Date().toISOString()
  
  try {
    const dir = path.dirname(STORE_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const data = JSON.stringify(questStoreData, null, 2)
    fs.writeFileSync(TMP_STORE_PATH, data, 'utf-8')
    fs.renameSync(TMP_STORE_PATH, STORE_PATH)
  } catch (error) {
    console.error('Failed to persist quest store:', error)
  }
}

// Auto-load once on import
loadQuestStore()
