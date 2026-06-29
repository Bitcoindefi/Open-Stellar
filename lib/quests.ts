export interface SubtaskRecord {
  id: string
  title: string
  status: string
  dependsOn?: string[]
}

type QuestDb = Map<string, Map<string, SubtaskRecord>>

const globalQuests = globalThis as typeof globalThis & {
  __openStellarQuestsDb__?: QuestDb
}

const db: QuestDb = globalQuests.__openStellarQuestsDb__ ?? new Map()
if (!globalQuests.__openStellarQuestsDb__) globalQuests.__openStellarQuestsDb__ = db

export function resetQuestStore() {
  db.clear()
}

export function seedQuestSubtasks(questId: string, subtasks: SubtaskRecord[] = []) {
  const map = new Map<string, SubtaskRecord>()
  for (const s of subtasks) map.set(s.id, { ...s, dependsOn: s.dependsOn ?? [] })
  db.set(questId, map)
}

export function listQuestSubtasks(questId: string): SubtaskRecord[] | null {
  const map = db.get(questId)
  if (!map) return null
  return Array.from(map.values())
}

export function questExists(questId: string): boolean {
  return db.has(questId)
}

export function seedEmptyQuest(questId: string) {
  if (!db.has(questId)) db.set(questId, new Map())
}
