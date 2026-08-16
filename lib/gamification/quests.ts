import { addNotification } from "@/lib/notifications/notification-store"
import { invalidateLeaderboardCache } from "./leaderboard-cache"
import { listStoredQuests } from "./quest-store"

export type QuestType = "daily" | "weekly" | "story"

export interface QuestReward {
  xp: number
  xlm?: string
  badge?: string
  title?: string
}

export interface SubTask {
  id: string
  title: string
  assignedAgentId?: string
  dependsOn?: string[]
  status: "pending" | "in_progress" | "done"
  completedAt?: string
}

export interface Quest {
  id: string
  type: QuestType
  title: string
  description: string
  reward: QuestReward
  progress: number
  unlocksQuestId?: string
  minReputation?: number
  completedAt?: string
  expiresAt?: string
  subTasks?: SubTask[]
  status?: "in_progress" | "completed"
}

interface QuestDefinition {
  id: string
  type: QuestType
  title: string
  description: string
  reward: QuestReward
  goal: number
  metric: QuestMetric
  unlocksQuestId?: string
  minReputation?: number
}

type QuestMetric =
  | "tasksCompletedToday"
  | "paymentsProcessedToday"
  | "uptimePercentToday"
  | "messagesSentToday"
  | "tasksCompletedWeek"
  | "xlmEarnedWeek"
  | "leaderboardRank"
  | "marketplaceServicesWeek"
  | "zkPassportsMinted"
  | "crossDistrictDelegations"
  | "subscriptionsAcquired"

export interface QuestStats {
  tasksCompletedToday: number
  paymentsProcessedToday: number
  uptimePercentToday: number
  messagesSentToday: number
  tasksCompletedWeek: number
  xlmEarnedWeek: number
  leaderboardRank: number | null
  marketplaceServicesWeek: number
  zkPassportsMinted: number
  crossDistrictDelegations: number
  subscriptionsAcquired: number
}

const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: "daily-complete-5-tasks",
    type: "daily",
    title: "Complete 5 tasks",
    description: "Finish five agent tasks before the daily UTC reset.",
    reward: { xp: 50, xlm: "0.05" },
    goal: 5,
    metric: "tasksCompletedToday",
  },
  {
    id: "daily-process-payment",
    type: "daily",
    title: "Process a payment",
    description: "Settle one Stellar or x402 payment through the agent wallet.",
    reward: { xp: 30 },
    goal: 1,
    metric: "paymentsProcessedToday",
  },
  {
    id: "daily-uptime-99",
    type: "daily",
    title: "Maintain 99% uptime for 24h",
    description: "Keep the selected agent fleet healthy for a full daily window.",
    reward: { xp: 20, badge: "Iron Badge progress" },
    goal: 99,
    metric: "uptimePercentToday",
  },
  {
    id: "daily-send-10-messages",
    type: "daily",
    title: "Send 10 inter-agent messages",
    description: "Coordinate agents with ten cross-agent chat messages.",
    reward: { xp: 15 },
    goal: 10,
    metric: "messagesSentToday",
  },
  {
    id: "weekly-complete-50-tasks",
    type: "weekly",
    title: "Complete 50 tasks",
    description: "Finish fifty agent tasks before the Sunday UTC reset.",
    reward: { xp: 500, badge: "Rare Taskmaster Badge" },
    goal: 50,
    metric: "tasksCompletedWeek",
  },
  {
    id: "weekly-earn-1-xlm",
    type: "weekly",
    title: "Earn 1 XLM from x402 services",
    description: "Collect one XLM in service revenue from x402 payments.",
    reward: { xp: 300 },
    goal: 1,
    metric: "xlmEarnedWeek",
  },
  {
    id: "weekly-top-10-district",
    type: "weekly",
    title: "Reach top 10 in district leaderboard",
    description: "Place an agent in the district leaderboard top ten.",
    reward: { xp: 200, title: "District Contender" },
    goal: 10,
    metric: "leaderboardRank",
  },
  {
    id: "weekly-onboard-marketplace-service",
    type: "weekly",
    title: "Onboard a marketplace service",
    description: "Publish one new service to the agent marketplace.",
    reward: { xp: 400 },
    goal: 1,
    metric: "marketplaceServicesWeek",
    minReputation: 50,
  },
  {
    id: "story-first-zk-passport",
    type: "story",
    title: "Mint your first ZK passport",
    description: "Create a ZK passport for permanent identity progression.",
    reward: { xp: 100, badge: "ZK Certified" },
    goal: 1,
    metric: "zkPassportsMinted",
  },
  {
    id: "story-cross-district-delegation",
    type: "story",
    title: "First cross-district task delegation",
    description: "Delegate a task between agents in two different districts.",
    reward: { xp: 150 },
    goal: 1,
    metric: "crossDistrictDelegations",
  },
  {
    id: "story-first-subscription",
    type: "story",
    title: "First subscription acquired",
    description: "Win the first recurring subscription for an agent service.",
    reward: { xp: 200 },
    goal: 1,
    metric: "subscriptionsAcquired",
  },
]

export function getNextDailyReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0))
}

export function getNextWeeklyReset(now: Date = new Date()): Date {
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday, 0, 0, 0, 0))
}

function getMetricValue(definition: QuestDefinition, stats: QuestStats): number {
  if (definition.metric === "leaderboardRank") {
    if (stats.leaderboardRank === null) return 0
    return stats.leaderboardRank <= definition.goal ? definition.goal : 0
  }

  return stats[definition.metric]
}

function toProgress(value: number, goal: number): number {
  if (goal <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((value / goal) * 100)))
}

type SubTaskStore = Map<string, SubTask[]>

const globalQuests = globalThis as typeof globalThis & {
  __openStellarQuestSubTasks__?: SubTaskStore
}

function hydrateSubTasks(): SubTaskStore {
  if (globalQuests.__openStellarQuestSubTasks__) return globalQuests.__openStellarQuestSubTasks__
  const map: SubTaskStore = new Map()
  
  for (const q of listStoredQuests({ includeExpired: true })) {
    if (q.subTasks && q.subTasks.length > 0) {
      map.set(q.id, q.subTasks)
    }
  }

  globalQuests.__openStellarQuestSubTasks__ = map
  return map
}

const subtaskDb = hydrateSubTasks()

export function getSubTasks(questId: string): SubTask[] {
  return subtaskDb.get(questId) ?? []
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).substring(2, 15)
}

export function addSubTask(questId: string, title: string, assignedAgentId?: string, dependsOn?: string[]): SubTask {
  const subtasks = getSubTasks(questId)
  const newSubTask: SubTask = {
    id: generateId(),
    title,
    assignedAgentId,
    ...(dependsOn !== undefined ? { dependsOn } : {}),
    status: "pending",
  }
  subtasks.push(newSubTask)
  subtaskDb.set(questId, subtasks)

  return newSubTask
}

export function updateSubTask(
  questId: string,
  subTaskId: string,
  updates: Partial<Omit<SubTask, "id">>
): SubTask | null {
  const subtasks = getSubTasks(questId)
  const index = subtasks.findIndex((st) => st.id === subTaskId)
  if (index === -1) return null

  const existing = subtasks[index]
  const updated: SubTask = {
    ...existing,
    ...updates,
  }

  if (updates.status === "done" && existing.status !== "done") {
    updated.completedAt = new Date().toISOString()
  } else if (updates.status && updates.status !== "done") {
    delete updated.completedAt
  }

  subtasks[index] = updated
  subtaskDb.set(questId, subtasks)

  return updated
}

export function buildQuests(stats: QuestStats, now: Date = new Date()): Quest[] {
  const completedAt = now.toISOString()
  const dailyReset = getNextDailyReset(now).toISOString()
  const weeklyReset = getNextWeeklyReset(now).toISOString()

  return QUEST_DEFINITIONS.map((definition) => {
    const subTasks = getSubTasks(definition.id)
    const expiresAt = definition.type === "daily" ? dailyReset : definition.type === "weekly" ? weeklyReset : undefined

    if (subTasks.length > 0) {
      const doneCount = subTasks.filter((st) => st.status === "done").length
      const calculatedProgress = Math.round((doneCount / subTasks.length) * 100)
      const progress = (calculatedProgress === 100 && doneCount < subTasks.length) ? 99 : calculatedProgress

      const isAllDone = doneCount === subTasks.length
      const questStatus = isAllDone ? "completed" : "in_progress"

      let questCompletedAt: string | undefined = undefined
      if (isAllDone) {
        const completedAts = subTasks.map((st) => st.completedAt).filter(Boolean) as string[]
        if (completedAts.length > 0) {
          questCompletedAt = completedAts.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        } else {
          questCompletedAt = completedAt
        }
      }

      return {
        id: definition.id,
        type: definition.type,
        title: definition.title,
        description: definition.description,
        reward: definition.reward,
        progress,
        subTasks,
        status: questStatus,
        ...(definition.unlocksQuestId ? { unlocksQuestId: definition.unlocksQuestId } : {}),
        ...(definition.minReputation !== undefined ? { minReputation: definition.minReputation } : {}),
        ...(isAllDone ? { completedAt: questCompletedAt } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      }
    } else {
      const progress = toProgress(getMetricValue(definition, stats), definition.goal)
      const questStatus = progress >= 100 ? "completed" : "in_progress"

      return {
        id: definition.id,
        type: definition.type,
        title: definition.title,
        description: definition.description,
        reward: definition.reward,
        progress,
        status: questStatus,
        ...(definition.unlocksQuestId ? { unlocksQuestId: definition.unlocksQuestId } : {}),
        ...(definition.minReputation !== undefined ? { minReputation: definition.minReputation } : {}),
        ...(progress >= 100 ? { completedAt } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      }
    }
  })
}

export function getMockQuestStats(now: Date = new Date()): QuestStats {
  const daySeed = now.getUTCDate()

  return {
    tasksCompletedToday: (daySeed % 6) + 2,
    paymentsProcessedToday: daySeed % 2,
    uptimePercentToday: 99,
    messagesSentToday: (daySeed % 8) + 3,
    tasksCompletedWeek: 32 + (daySeed % 19),
    xlmEarnedWeek: Number(((daySeed % 12) / 10).toFixed(2)),
    leaderboardRank: daySeed % 3 === 0 ? 8 : 14,
    marketplaceServicesWeek: daySeed % 5 === 0 ? 1 : 0,
    zkPassportsMinted: 1,
    crossDistrictDelegations: daySeed % 2,
    subscriptionsAcquired: 0,
  }
}

export function getQuests(now: Date = new Date()): Quest[] {
  return buildQuests(getMockQuestStats(now), now)
}

export function getQuestById(id: string, now: Date = new Date()): Quest | null {
  return getQuests(now).find((quest) => quest.id === id) ?? null
}

export function recordCompletedQuestNotifications(agentId: string, quests: Quest[]): void {
  const cleanId = agentId.trim()
  if (!cleanId) return

  let anyCompleted = false

  for (const quest of quests) {
    if (!quest.completedAt) continue
    anyCompleted = true

    addNotification({
      agentId: cleanId,
      type: "quest_completed",
      title: "Quest completed",
      body: `${quest.title} is ready to claim.`,
      resourceHref: `/?quest=${encodeURIComponent(quest.id)}`,
      resourceLabel: quest.title,
      createdAt: quest.completedAt,
      dedupeKey: `quest_completed:${cleanId}:${quest.id}:${quest.completedAt}`,
    })
  }

  // Invalidate cache when any quest is completed so next read reflects latest state
  if (anyCompleted) {
    invalidateLeaderboardCache()
  }
}
