import type { Quest, QuestType, QuestReward, SubTask } from "./quests"
import { addNotification } from "@/lib/notifications/notification-store"
import { publishSystemEvent } from "@/lib/events/system-events"

const STALE_QUEST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type QuestStatus = "in_progress" | "completed" | "expired"

export interface StoredQuest {
  id: string
  type: QuestType
  title: string
  description: string
  reward: QuestReward
  progress: number
  unlocksQuestId?: string
  minReputation?: number
  completedAt?: string
  expiresAt?: string | null
  subTasks?: SubTask[]
  status: QuestStatus
  createdAt: string
  assignedAgentIds: string[]
}

interface QuestStore {
  quests: Map<string, StoredQuest>
}

const globalState = globalThis as typeof globalThis & {
  __openStellarQuestStore__?: QuestStore
}

function getStore(): QuestStore {
  if (!globalState.__openStellarQuestStore__) {
    globalState.__openStellarQuestStore__ = {
      quests: new Map(),
    }
  }
  return globalState.__openStellarQuestStore__
}

export function createQuest(input: {
  id: string
  type: QuestType
  title: string
  description: string
  reward: QuestReward
  progress?: number
  unlocksQuestId?: string
  minReputation?: number
  expiresAt?: string | null
  subTasks?: SubTask[]
  assignedAgentIds?: string[]
}): StoredQuest {
  const store = getStore()
  const quest: StoredQuest = {
    id: input.id,
    type: input.type,
    title: input.title,
    description: input.description,
    reward: input.reward,
    progress: input.progress ?? 0,
    unlocksQuestId: input.unlocksQuestId,
    minReputation: input.minReputation,
    expiresAt: input.expiresAt ?? null,
    subTasks: input.subTasks,
    status: "in_progress",
    createdAt: new Date().toISOString(),
    assignedAgentIds: input.assignedAgentIds ?? [],
  }
  store.quests.set(quest.id, quest)
  return quest
}

export function getStoredQuest(id: string): StoredQuest | null {
  return getStore().quests.get(id) ?? null
}

export function listStoredQuests(options?: { includeExpired?: boolean }): StoredQuest[] {
  const quests = Array.from(getStore().quests.values())
  if (!options?.includeExpired) {
    return quests.filter((q) => q.status !== "expired")
  }
  return quests
}

export function updateQuestStatus(id: string, status: QuestStatus): StoredQuest | null {
  const store = getStore()
  const quest = store.quests.get(id)
  if (!quest) return null
  const wasCompleted = quest.status === "completed"
  quest.status = status
  if (status === "completed") {
    quest.completedAt = new Date().toISOString()

    if (!wasCompleted && quest.unlocksQuestId) {
      const unlockedQuest = store.quests.get(quest.unlocksQuestId)
      if (unlockedQuest) {
        for (const agentId of new Set(quest.assignedAgentIds)) {
          if (!unlockedQuest.assignedAgentIds.includes(agentId)) {
            unlockedQuest.assignedAgentIds.push(agentId)
          }
          publishSystemEvent({
            type: "quest.unlocked",
            agentId,
            questId: quest.unlocksQuestId,
          })
        }
      }
    }
  }
  return quest
}

function questShouldExpire(quest: StoredQuest, nowMs: number): boolean {
  if (quest.expiresAt) {
    return new Date(quest.expiresAt).getTime() <= nowMs
  }

  if (quest.expiresAt === null) {
    return nowMs - new Date(quest.createdAt).getTime() > STALE_QUEST_MAX_AGE_MS
  }

  return false
}

function getQuestProgressParticipants(quest: StoredQuest): Array<{
  agentId: string
  completedSubtasks: number
  totalSubtasks: number
}> {
  const subTasks = quest.subTasks ?? []
  const progressByAgent = new Map<string, { completedSubtasks: number; hasProgress: boolean }>()

  for (const subTask of subTasks) {
    const agentId = subTask.assignedAgentId?.trim()
    if (!agentId) continue

    const current = progressByAgent.get(agentId) ?? { completedSubtasks: 0, hasProgress: false }
    if (subTask.status === "done") {
      current.completedSubtasks += 1
      current.hasProgress = true
    } else if (subTask.status === "in_progress") {
      current.hasProgress = true
    }
    progressByAgent.set(agentId, current)
  }

  return Array.from(progressByAgent.entries())
    .filter(([, progress]) => progress.hasProgress)
    .map(([agentId, progress]) => ({
      agentId,
      completedSubtasks: progress.completedSubtasks,
      totalSubtasks: subTasks.length,
    }))
}

export function setQuestExpired(id: string): { quest: StoredQuest | null; notified: string[] } {
  const existingQuest = getStoredQuest(id)
  const participants = existingQuest ? getQuestProgressParticipants(existingQuest) : []
  const quest = updateQuestStatus(id, "expired")
  if (!quest) return { quest: null, notified: [] }

  const notified: string[] = []
  for (const participant of participants) {
    addNotification({
      agentId: participant.agentId,
      type: "quest_expired",
      title: "Quest expired",
      body: `The quest "${quest.title}" has expired and is no longer available.`,
      resourceHref: `/?quest=${encodeURIComponent(quest.id)}`,
      resourceLabel: quest.title,
      dedupeKey: `quest_expired:${quest.id}:${participant.agentId}`,
    })
    publishSystemEvent({
      type: "quest.expired",
      agentId: participant.agentId,
      questId: quest.id,
      completedSubtasks: participant.completedSubtasks,
      totalSubtasks: participant.totalSubtasks,
    })
    notified.push(participant.agentId)
  }

  return { quest, notified }
}

export function runQuestExpiryCheck(nowMs = Date.now()): {
  expired: number
  checked: number
  notified: number
  quests: StoredQuest[]
} {
  const store = getStore()
  const quests = Array.from(store.quests.values())
  let expired = 0
  let notified = 0
  const expiredQuests: StoredQuest[] = []

  for (const quest of quests) {
    if (quest.status === "completed" || quest.status === "expired") continue

    if (questShouldExpire(quest, nowMs)) {
      const result = setQuestExpired(quest.id)
      if (result.quest) {
        expired += 1
        notified += result.notified.length
        expiredQuests.push(result.quest)
      }
    }
  }

  return { expired, checked: quests.length, notified, quests: expiredQuests }
}

export function resetQuestStore(): void {
  getStore().quests.clear()
}

export function seedQuest(quest: Partial<StoredQuest> & { id: string }): StoredQuest {
  const store = getStore()
  const full: StoredQuest = {
    type: "daily",
    title: "Test quest",
    description: "Test",
    reward: { xp: 10 },
    progress: 0,
    status: "in_progress",
    createdAt: new Date().toISOString(),
    assignedAgentIds: [],
    expiresAt: null,
    ...quest,
  } as StoredQuest
  // Ensure expiresAt is explicitly null when not provided
  if (!("expiresAt" in quest)) {
    full.expiresAt = null
  }
  store.quests.set(full.id, full)
  return full
}
