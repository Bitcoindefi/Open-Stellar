"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  createToastQueueState,
  dismissToast,
  enqueueToast,
  TOAST_AUTO_DISMISS_MS,
  type ToastNotification,
  type ToastQueueState,
} from "@/lib/notifications/toast-queue"
import type { PublishedSystemEvent } from "@/lib/events/system-events"

interface NotificationsContextValue {
  push: (notification: Omit<ToastNotification, "id"> & { id?: string }) => string
  dismiss: (id: string) => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

function toneClasses(tone: ToastNotification["tone"]): string {
  if (tone === "success") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100 shadow-[0_18px_50px_rgba(16,185,129,0.15)]"
  }
  return "border-cyan-400/30 bg-slate-950/95 text-slate-100 shadow-[0_18px_50px_rgba(2,8,23,0.35)]"
}

function isLevelUpEvent(event: PublishedSystemEvent): event is PublishedSystemEvent & {
  type: "agent.xp"
  leveledUp: boolean
  level: number
} {
  return event.type === "agent.xp" && Boolean((event as { leveledUp?: boolean }).leveledUp)
}

function isQuestCompletedEvent(event: PublishedSystemEvent): event is PublishedSystemEvent & {
  type: "quest.completed"
  questTitle?: string
  reward?: { xp?: number }
} {
  return event.type === "quest.completed"
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastQueueState>(() => createToastQueueState())
  const timersRef = useRef<Map<string, ReturnType<typeof window.setTimeout>>>(new Map())
  const seenEventsRef = useRef<Set<string>>(new Set())

  const dismiss = (id: string) => {
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setState((current) => dismissToast(current, id))
  }

  const push = (notification: Omit<ToastNotification, "id"> & { id?: string }) => {
    const id = notification.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const next: ToastNotification = { ...notification, id }
    setState((current) => enqueueToast(current, next))
    return id
  }

  useEffect(() => {
    for (const toast of state.visible) {
      if (timersRef.current.has(toast.id)) continue
      const timer = window.setTimeout(() => {
        dismiss(toast.id)
      }, TOAST_AUTO_DISMISS_MS)
      timersRef.current.set(toast.id, timer)
    }
  }, [state.visible])

  useEffect(() => {
    const source = new EventSource("/api/events")

    const handleEvent = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as PublishedSystemEvent
        if (!event.id || seenEventsRef.current.has(event.id)) return
        seenEventsRef.current.add(event.id)

        if (isLevelUpEvent(event)) {
          push({
            id: `level-up:${event.id}`,
            title: "Level up!",
            message: `You're now Level ${event.level}`,
            tone: "success",
          })
          return
        }

        if (isQuestCompletedEvent(event)) {
          push({
            id: `quest-complete:${event.id}`,
            title: "Quest complete",
            message: `${event.questTitle ?? "Quest completed"} (+${event.reward?.xp ?? 0} XP)`,
            tone: "success",
          })
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    }

    source.addEventListener("agent.xp", handleEvent as EventListener)
    source.addEventListener("quest.completed", handleEvent as EventListener)

    return () => {
      source.close()
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer)
      }
      timersRef.current.clear()
    }
  }, [])

  return (
    <NotificationsContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3">
        {state.visible.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 transition duration-300 animate-in slide-in-from-right-4 fade-in-0 ${toneClasses(toast.tone)}`}
            role="status"
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-400">
              {toast.title}
            </div>
            <div className="mt-2 font-mono text-sm leading-5">{toast.message}</div>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext)
  if (!value) {
    throw new Error("useNotifications must be used within NotificationProvider")
  }
  return value
}
