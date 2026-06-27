import type { NotificationType } from "@/lib/notifications/notification-store"

export interface NotificationPreferences {
  agentId: string
  muted: NotificationType[]
  updatedAt: string
}

type NotificationPreferenceStore = Map<string, NotificationPreferences>

const globalPreferences = globalThis as typeof globalThis & {
  __notificationPreferenceStore__?: NotificationPreferenceStore
}

const store: NotificationPreferenceStore =
  globalPreferences.__notificationPreferenceStore__ ?? new Map()

if (!globalPreferences.__notificationPreferenceStore__) {
  globalPreferences.__notificationPreferenceStore__ = store
}

export function getNotificationPreferences(agentId: string): NotificationPreferences {
  const cleanId = agentId.trim()
  if (!cleanId) throw new Error("agentId is required")

  return store.get(cleanId) ?? {
    agentId: cleanId,
    muted: [],
    updatedAt: new Date().toISOString(),
  }
}

export function setNotificationPreferences(
  agentId: string,
  muted: NotificationType[],
): NotificationPreferences {
  const cleanId = agentId.trim()
  if (!cleanId) throw new Error("agentId is required")

  const preferences: NotificationPreferences = {
    agentId: cleanId,
    muted: [...muted],
    updatedAt: new Date().toISOString(),
  }
  store.set(cleanId, preferences)
  return preferences
}

export function isNotificationTypeMuted(agentId: string, type: NotificationType): boolean {
  return store.get(agentId.trim())?.muted.includes(type) ?? false
}

export function resetNotificationPreferences(): void {
  store.clear()
}
