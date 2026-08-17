export const MAX_VISIBLE_NOTIFICATIONS = 3
export const TOAST_AUTO_DISMISS_MS = 4_000

export interface ToastNotification {
  id: string
  title: string
  message: string
  tone?: "info" | "success"
}

export interface ToastQueueState {
  visible: ToastNotification[]
  queued: ToastNotification[]
}

export function createToastQueueState(): ToastQueueState {
  return {
    visible: [],
    queued: [],
  }
}

export function enqueueToast(state: ToastQueueState, notification: ToastNotification): ToastQueueState {
  if (state.visible.length < MAX_VISIBLE_NOTIFICATIONS) {
    return {
      visible: [...state.visible, notification],
      queued: state.queued,
    }
  }

  return {
    visible: state.visible,
    queued: [...state.queued, notification],
  }
}

export function dismissToast(state: ToastQueueState, id: string): ToastQueueState {
  const nextVisible = state.visible.filter((notification) => notification.id !== id)
  if (nextVisible.length === state.visible.length) {
    return state
  }

  if (state.queued.length === 0) {
    return {
      visible: nextVisible,
      queued: [],
    }
  }

  const [nextToast, ...remainingQueue] = state.queued
  return {
    visible: [...nextVisible, nextToast],
    queued: remainingQueue,
  }
}
