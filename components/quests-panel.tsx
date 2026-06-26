"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import type { Quest } from "@/lib/gamification/quests"

const questTypeColors: Record<Quest["type"], string> = {
  daily: "#22d3ee",
  weekly: "#a78bfa",
  story: "#fbbf24",
}

function formatReward(quest: Quest): string {
  const parts = [`${quest.reward.xp} XP`]
  if (quest.reward.xlm) parts.push(`${quest.reward.xlm} XLM`)
  if (quest.reward.badge) parts.push(quest.reward.badge)
  if (quest.reward.title) parts.push(quest.reward.title)
  return parts.join(" + ")
}

function formatCountdown(expiresAt?: string): string {
  if (!expiresAt) return "Permanent"

  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return "Reset pending"

  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return `${hours}h ${minutes}m`
}

function QuestCard({
  quest,
  currentReputation,
  onClaim,
}: {
  quest: Quest
  currentReputation: number | null
  onClaim: (quest: Quest) => void
}) {
  const isComplete = quest.progress >= 100
  const color = questTypeColors[quest.type]
  const minReputation = quest.minReputation
  const hasReputationGate = minReputation !== undefined
  const isEligible = minReputation !== undefined && currentReputation !== null && currentReputation >= minReputation
  const isReputationTooLow = minReputation !== undefined && currentReputation !== null && currentReputation < minReputation
  const canClaim = isComplete && !isReputationTooLow

  return (
    <div
      style={{
        padding: 10,
        borderRadius: 8,
        background: isComplete ? `${color}14` : "#0f172a",
        border: `1px solid ${isComplete ? `${color}66` : "#263449"}`,
        opacity: quest.expiresAt && new Date(quest.expiresAt).getTime() <= Date.now() ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span style={{ color, fontSize: 10, fontFamily: "monospace", fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
          {quest.type}
        </span>
        <span style={{ color: "#64748b", fontSize: 10, fontFamily: "monospace" }}>{formatCountdown(quest.expiresAt)}</span>
      </div>

      <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 700, fontFamily: "monospace", marginBottom: 4 }}>{quest.title}</div>
      <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>{quest.description}</div>

      {hasReputationGate && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <span style={{ color: "#cbd5e1", fontSize: 10, fontFamily: "monospace" }}>
            Min reputation {minReputation}
          </span>
          {currentReputation !== null && (
            <span
              style={{
                border: `1px solid ${isEligible ? "#34d39966" : "#f8717166"}`,
                borderRadius: 999,
                color: isEligible ? "#34d399" : "#f87171",
                fontSize: 9,
                fontFamily: "monospace",
                fontWeight: 800,
                padding: "2px 6px",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {isEligible ? "Eligible" : "Reputation too low"}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>Progress</span>
        <span style={{ color, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>{quest.progress}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#020617", overflow: "hidden", marginBottom: 8 }}>
        <div style={{ width: `${quest.progress}%`, height: "100%", background: color, transition: "width 0.25s ease" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: "#cbd5e1", fontSize: 10, fontFamily: "monospace" }}>{formatReward(quest)}</span>
        <button
          type="button"
          disabled={!canClaim}
          onClick={() => onClaim(quest)}
          style={{
            padding: "5px 8px",
            borderRadius: 5,
            border: `1px solid ${canClaim ? color : "#334155"}`,
            background: canClaim ? `${color}22` : "#111827",
            color: canClaim ? color : "#475569",
            cursor: canClaim ? "pointer" : "not-allowed",
            fontSize: 10,
            fontFamily: "monospace",
            fontWeight: 800,
            textTransform: "uppercase",
          }}
        >
          Claim
        </button>
      </div>
    </div>
  )
}

export function QuestsPanel({ selectedAgentId }: { selectedAgentId?: string | null }) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [currentReputation, setCurrentReputation] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadQuests(): Promise<void> {
      try {
        const response = await fetch("/api/quests", { cache: "no-store" })
        if (!response.ok) throw new Error("Quest API unavailable")
        const data = (await response.json()) as { quests: Quest[] }
        if (!cancelled) setQuests(data.quests)
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load quests")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadQuests()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedAgentId) {
      setCurrentReputation(null)
      return
    }

    const actorId = selectedAgentId
    let cancelled = false

    async function loadReputation(): Promise<void> {
      try {
        const response = await fetch(`/api/protocol/reputation?actorId=${encodeURIComponent(actorId)}`, { cache: "no-store" })
        const data = await response.json()
        if (!cancelled) {
          setCurrentReputation(typeof data?.reputation?.score === "number" ? data.reputation.score : null)
        }
      } catch {
        if (!cancelled) setCurrentReputation(null)
      }
    }

    loadReputation()
    return () => {
      cancelled = true
    }
  }, [selectedAgentId])

  const groupedQuests = useMemo(() => ({
    daily: quests.filter((quest) => quest.type === "daily"),
    weekly: quests.filter((quest) => quest.type === "weekly"),
    story: quests.filter((quest) => quest.type === "story"),
  }), [quests])

  const completedCount = quests.filter((quest) => quest.progress >= 100).length

  function handleClaim(quest: Quest): void {
    if (quest.reward.xlm) {
      toast.info(`${quest.title} requires wallet signature to claim ${quest.reward.xlm} XLM`)
      return
    }

    toast.success(`Claimed ${formatReward(quest)}`)
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#111827" }}>
      <div style={{ padding: 12, borderBottom: "1px solid #2a3a52" }}>
        <div style={{ color: "#e2e8f0", fontSize: 14, fontFamily: "monospace", fontWeight: 800 }}>Quest Board</div>
        <div suppressHydrationWarning style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
          {completedCount} ready to claim · resets update every minute · {new Date(now).toUTCString().slice(17, 22)} UTC
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 10 }}>
        {loading && <div style={{ color: "#64748b", fontSize: 12 }}>Loading quests...</div>}
        {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
        {!loading && !error && (["daily", "weekly", "story"] as const).map((type) => (
          <section key={type} style={{ marginBottom: 14 }}>
            <div style={{ color: questTypeColors[type], fontSize: 11, fontFamily: "monospace", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>
              {type} quests
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groupedQuests[type].map((quest) => (
                <QuestCard
                  key={quest.id}
                  quest={quest}
                  currentReputation={currentReputation}
                  onClaim={handleClaim}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
