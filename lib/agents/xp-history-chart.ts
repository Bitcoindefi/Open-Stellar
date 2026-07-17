import { getXpToNextLevel } from "@/lib/gamification/xp"

export interface XpHistorySnapshot {
  date: string
  label: string
  xp: number
}

export interface XpHistoryEventLike {
  type: "earned" | "decayed"
  delta: number
  timestamp: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toShortLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date)
}

export function buildSevenDayXpSnapshots(
  events: XpHistoryEventLike[],
  now: Date = new Date(),
): XpHistorySnapshot[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = end - DAY_MS * 6
  const totals = new Map<string, number>()

  for (let offset = 0; offset < 7; offset += 1) {
    totals.set(toUtcDateKey(new Date(start + DAY_MS * offset)), 0)
  }

  for (const event of events) {
    if (event.type !== "earned" || event.delta <= 0) continue

    const timestamp = new Date(event.timestamp).getTime()
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp >= end + DAY_MS) continue

    const key = toUtcDateKey(new Date(timestamp))
    totals.set(key, (totals.get(key) ?? 0) + event.delta)
  }

  return Array.from(totals.entries()).map(([date, xp]) => ({
    date,
    label: toShortLabel(date),
    xp,
  }))
}

export function getLevelProgress(totalXp: number, level: number): { currentLevelXp: number; nextLevelXp: number; progressPercent: number } {
  const safeLevel = Math.max(1, Math.floor(level))
  const currentLevelXp = safeLevel <= 1 ? 0 : getXpToNextLevel(safeLevel - 1)
  const nextLevelXp = getXpToNextLevel(safeLevel)
  if (nextLevelXp <= currentLevelXp) {
    return { currentLevelXp, nextLevelXp, progressPercent: 100 }
  }

  const progressPercent = Math.min(100, Math.max(0, ((totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100))
  return { currentLevelXp, nextLevelXp, progressPercent }
}
