export const WEBHOOK_EVENT_TYPES = [
  "agent.status", "agent.xp",
  "payment.received",
  "task.started", "task.completed",
  "quest.completed",
  "badge.unlocked", "district.unlocked",
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]
