export const NOTIFICATION_TYPES = ["agent_offline", "quest_completed", "reputation_updated", "quest_expired"] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export interface NotificationRecord {
  id: string
  cursor: string
  agentId: string
  type: NotificationType
  title: string
  body: string
  resourceHref: string
  resourceLabel: string
  createdAt: string
  readAt: string | null
  dedupeKey?: string
}

export interface AddNotificationInput {
  agentId: string
  type: NotificationType
  title: string
  body: string
  resourceHref: string
  resourceLabel: string
  createdAt?: string
  dedupeKey?: string
}

export interface ListNotificationsOptions {
  since?: string | null
  limit?: number
}

type NotificationStore = Map<string, NotificationRecord[]>

const MAX_NOTIFICATIONS_PER_AGENT = 50
const DEFAULT_NOTIFICATION_LIMIT = 20

const globalNotifications = globalThis as typeof globalThis & {
  __notificationStore__?: NotificationStore
  __notificationCursor__?: number
}

const store: NotificationStore = globalNotifications.__notificationStore__ ?? new Map()
if (!globalNotifications.__notificationStore__) {
  globalNotifications.__notificationStore__ = store
}

if (typeof globalNotifications.__notificationCursor__ !== "number") {
  globalNotifications.__notificationCursor__ = 0
}

function nextCursor(): string {
  globalNotifications.__notificationCursor__ = (globalNotifications.__notificationCursor__ ?? 0) + 1
  return String(globalNotifications.__notificationCursor__)
}

function clampLimit(limit: number | undefined, fallback = DEFAULT_NOTIFICATION_LIMIT): number {
  if (!Number.isFinite(limit)) return fallback
  return Math.max(1, Math.min(MAX_NOTIFICATIONS_PER_AGENT, Math.floor(Number(limit))))
}

function agentNotifications(agentId: string): NotificationRecord[] {
  const cleanId = agentId.trim()
  if (!cleanId) return []
  const existing = store.get(cleanId)
  if (existing) return existing
  const created: NotificationRecord[] = []
  store.set(cleanId, created)
  return created
}

export function addNotification(input: AddNotificationInput): NotificationRecord {
  const agentId = input.agentId.trim()
  if (!agentId) throw new Error("agentId is required")

  const notifications = agentNotifications(agentId)
  if (input.dedupeKey) {
    const duplicate = notifications.find(
      (notification) => notification.type === input.type && notification.dedupeKey === input.dedupeKey,
    )
    if (duplicate) return duplicate
  }

  const cursor = nextCursor()
  const notification: NotificationRecord = {
    id: `${agentId}-${cursor}`,
    cursor,
    agentId,
    type: input.type,
    title: input.title,
    body: input.body,
    resourceHref: input.resourceHref,
    resourceLabel: input.resourceLabel,
    createdAt: input.createdAt ?? new Date().toISOString(),
    readAt: null,
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  }

  notifications.push(notification)
  if (notifications.length > MAX_NOTIFICATIONS_PER_AGENT) {
    notifications.splice(0, notifications.length - MAX_NOTIFICATIONS_PER_AGENT)
  }

  return notification
}

export function listUnseenNotifications(
  agentId: string,
  options: ListNotificationsOptions = {},
): NotificationRecord[] {
  const sinceCursor = Number(options.since ?? 0)
  const hasSince = Number.isFinite(sinceCursor) && sinceCursor > 0
  const limit = clampLimit(options.limit)

  return (store.get(agentId.trim()) ?? [])
    .filter((notification) => notification.readAt === null)
    .filter((notification) => !hasSince || Number(notification.cursor) > sinceCursor)
    .slice()
    .reverse()
    .slice(0, limit)
}

export function getUnreadNotificationCount(agentId: string): number {
  return (store.get(agentId.trim()) ?? []).filter((notification) => notification.readAt === null).length
}

export function markAllNotificationsRead(agentId: string, readAt = new Date().toISOString()): number {
  let markedRead = 0
  for (const notification of store.get(agentId.trim()) ?? []) {
    if (notification.readAt === null) {
      notification.readAt = readAt
      markedRead += 1
    }
  }
  return markedRead
}

export function resetNotificationStore(): void {
  store.clear()
  globalNotifications.__notificationCursor__ = 0
}
