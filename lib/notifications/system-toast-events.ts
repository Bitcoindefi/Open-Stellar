import type { PublishedSystemEvent } from "@/lib/events/system-events"
import type { ToastNotification } from "@/lib/notifications/toast-queue"

export function createToastFromSystemEvent(event: PublishedSystemEvent): ToastNotification | null {
  if (event.type === "agent.xp" && event.leveledUp) {
    return {
      id: `level-up:${event.id}`,
      title: "Level up!",
      message: `You're now Level ${event.level}`,
      tone: "success",
    }
  }

  if (event.type === "quest.completed") {
    return {
      id: `quest-complete:${event.id}`,
      title: "Quest complete",
      message: `${event.questTitle ?? "Quest completed"} (+${event.reward?.xp ?? 0} XP)`,
      tone: "success",
    }
  }

  return null
}
