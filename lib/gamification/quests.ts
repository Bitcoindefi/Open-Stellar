export type QuestType = "daily" | "weekly" | "story"

export interface QuestReward {
  xp: number
  xlm?: string
  badge?: string
  title?: string
}

export interface Quest {
  id: string
  type: QuestType
  title: string
  description: string
  reward: QuestReward
  progress: number
  completedAt?: string
  expiresAt?: string
}

interface QuestDefinition {
  id: string
  type: QuestType
  title: string
  description: string
  reward: QuestReward
  goal: number
  metric: QuestMetric
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

export function buildQuests(stats: QuestStats, now: Date = new Date()): Quest[] {
  const completedAt = now.toISOString()
  const dailyReset = getNextDailyReset(now).toISOString()
  const weeklyReset = getNextWeeklyReset(now).toISOString()

  return QUEST_DEFINITIONS.map((definition) => {
    const progress = toProgress(getMetricValue(definition, stats), definition.goal)
    const expiresAt = definition.type === "daily" ? dailyReset : definition.type === "weekly" ? weeklyReset : undefined

    return {
      id: definition.id,
      type: definition.type,
      title: definition.title,
      description: definition.description,
      reward: definition.reward,
      progress,
      ...(progress >= 100 ? { completedAt } : {}),
      ...(expiresAt ? { expiresAt } : {}),
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
