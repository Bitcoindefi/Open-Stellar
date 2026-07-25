export type QuestStatus = "open" | "in_progress" | "abandoned" | "expired" | "completed"

export interface Quest {
  id: string
  title: string
  status: QuestStatus
  assignedTo: string | null
  applicants: string[]
  createdAt: string
  updatedAt: string
}

export interface StaleQuestCheckResult {
  checkedAt: string
  checkedQuests: number
  abandoned: Quest[]
  expired: Quest[]
}

export const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000

type QuestDb = Map<string, Quest>

const globalQuests = globalThis as typeof globalThis & {
  __openStellarQuestDb__?: QuestDb
}

const db: QuestDb = globalQuests.__openStellarQuestDb__ ??= new Map()

export function createQuest(input: {
  id?: string
  title: string
  status?: QuestStatus
  assignedTo?: string | null
  applicants?: string[]
  createdAt?: string
  updatedAt?: string
}): Quest {
  const now = new Date().toISOString()
  const quest: Quest = {
    id: input.id ?? `quest-${Date.now()}`,
    title: input.title,
    status: input.status ?? (input.assignedTo ? "in_progress" : "open"),
    assignedTo: input.assignedTo ?? null,
    applicants: input.applicants ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
  db.set(quest.id, quest)
  return quest
}

export function getQuest(id: string): Quest | null {
  return db.get(id) ?? null
}

export function listQuests(): Quest[] {
  return Array.from(db.values())
}

export function runStaleQuestCheck(nowMs = Date.now()): StaleQuestCheckResult {
  const abandoned: Quest[] = []
  const expired: Quest[] = []
  const cutoffMs = nowMs - STALE_THRESHOLD_MS
  const nowIso = new Date(nowMs).toISOString()

  for (const quest of db.values()) {
    if (quest.status !== "open" && quest.status !== "in_progress") continue

    const updatedMs = Date.parse(quest.updatedAt)

    if (quest.status === "in_progress" && updatedMs < cutoffMs) {
      quest.status = "abandoned"
      quest.updatedAt = nowIso
      abandoned.push({ ...quest })
    } else if (
      quest.status === "open" &&
      quest.assignedTo === null &&
      quest.applicants.length === 0 &&
      updatedMs < cutoffMs
    ) {
      quest.status = "expired"
      quest.updatedAt = nowIso
      expired.push({ ...quest })
    }
  }

  return {
    checkedAt: nowIso,
    checkedQuests: db.size,
    abandoned,
    expired,
  }
}

export function resetQuestStore() {
  db.clear()
}
