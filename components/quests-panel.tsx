"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import type { Quest } from "@/lib/gamification/quests"
import type { QuestLeaderboardEntry } from "@/lib/gamification/quest-leaderboard"

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
  onSubTaskToggle,
}: {
  quest: Quest
  currentReputation: number | null
  onClaim: (quest: Quest) => void
  onSubTaskToggle?: (questId: string, subTaskId: string, currentStatus: string) => void
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

      {quest.subTasks && quest.subTasks.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "monospace", fontWeight: 700 }}>
            Sub-Tasks
          </div>
          {quest.subTasks.map((subTask) => (
            <div
              key={subTask.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 8px",
                background: "#020617",
                borderRadius: 4,
                border: "1px solid #1e293b",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={subTask.status === "done"}
                  onChange={() => onSubTaskToggle?.(quest.id, subTask.id, subTask.status)}
                  style={{
                    cursor: "pointer",
                    accentColor: color,
                  }}
                />
                <span
                  style={{
                    color: subTask.status === "done" ? "#64748b" : "#e2e8f0",
                    fontSize: 11,
                    fontFamily: "monospace",
                    textDecoration: subTask.status === "done" ? "line-through" : "none",
                    wordBreak: "break-all",
                  }}
                >
                  {subTask.title}
                </span>
              </label>
              {subTask.assignedAgentId ? (
                <span
                  style={{
                    background: `${color}1A`,
                    border: `1px solid ${color}40`,
                    color: color,
                    fontSize: 9,
                    fontFamily: "monospace",
                    padding: "1px 6px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  Agent #{subTask.assignedAgentId}
                </span>
              ) : (
                <span
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    color: "#94a3b8",
                    fontSize: 9,
                    fontFamily: "monospace",
                    padding: "1px 6px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  Unassigned
                </span>
              )}
            </div>
          ))}
        </div>
      )}

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

  // ── Leaderboard state ────────────────────────────────────────────────
  const [leaderboard, setLeaderboard] = useState<QuestLeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  async function loadQuests(): Promise<void> {
    try {
      const response = await fetch("/api/quests", { cache: "no-store" })
      if (!response.ok) throw new Error("Quest API unavailable")
      const data = (await response.json()) as { quests: Quest[] }
      setQuests(data.quests)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load quests")
    } finally {
      setLoading(false)
    }
  }

  // ── Load leaderboard ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    fetch("/api/quests/leaderboard?period=weekly", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return
        if (data.ok) {
          setLeaderboard(data.entries ?? [])
        } else {
          setLeaderboardError(data.error || "Failed to load leaderboard")
        }
      })
      .catch(() => {
        if (mounted) setLeaderboardError("Failed to load leaderboard")
      })
      .finally(() => {
        if (mounted) setLeaderboardLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    loadQuests()
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

  const handleSubTaskToggle = async (questId: string, subTaskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "done" ? "pending" : "done"
    try {
      const response = await fetch(
        `/api/quests/${encodeURIComponent(questId)}/subtasks/${encodeURIComponent(subTaskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      )
      if (!response.ok) {
        throw new Error("Failed to update subtask")
      }
      await loadQuests()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to toggle subtask")
    }
  }

  const groupedQuests = useMemo(() => ({
    daily: quests.filter((quest) => quest.type === "daily"),
    weekly: quests.filter((quest) => quest.type === "weekly"),
    story: quests.filter((quest) => quest.type === "story"),
  }), [quests])

  const completedCount = quests.filter((quest) => quest.progress >= 100).length

  // ── Leaderboard helpers ──────────────────────────────────────────────
  const topEntries = leaderboard.slice(0, 3)
  const userEntry = selectedAgentId ? leaderboard.find((e) => e.agentId === selectedAgentId) : null

  function getRankColor(rank: number): string {
    if (rank === 1) return "#fbbf24"   // amber-400
    if (rank === 2) return "#cbd5e1"   // slate-300
    if (rank === 3) return "#d97706"   // amber-600
    return "#64748b"                   // slate-500
  }

  function getRankBg(rank: number): string {
    if (rank === 1) return "rgba(251,191,36,0.12)"
    if (rank === 2) return "rgba(203,213,225,0.10)"
    if (rank === 3) return "rgba(217,119,6,0.10)"
    return "rgba(15,23,42,0.80)"
  }

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
                  onSubTaskToggle={handleSubTaskToggle}
                />
              ))}
            </div>
          </section>
        ))}

        {/* ── Leaderboard section ─────────────────────────────────────── */}
        <section style={{ marginTop: 8, marginBottom: 14 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}>
            <div style={{
              color: "#a78bfa",
              fontSize: 11,
              fontFamily: "monospace",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}>
              Top agents this week
            </div>
            <span style={{
              color: "#64748b",
              fontSize: 9,
              fontFamily: "monospace",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}>
              Weekly
            </span>
          </div>

          {leaderboardLoading && (
            <div style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace", padding: "8px 0" }}>
              Loading leaderboard…
            </div>
          )}

          {leaderboardError && (
            <div style={{ color: "#f87171", fontSize: 11, fontFamily: "monospace", padding: "8px 0" }}>
              {leaderboardError}
            </div>
          )}

          {!leaderboardLoading && !leaderboardError && topEntries.length === 0 && (
            <div style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace", padding: "8px 0" }}>
              No quest completions this week yet.
            </div>
          )}

          {!leaderboardLoading && !leaderboardError && topEntries.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topEntries.map((entry) => {
                const isUser = entry.agentId === selectedAgentId
                const rankColor = getRankColor(entry.rank)
                const rankBg = getRankBg(entry.rank)

                return (
                  <div
                    key={entry.agentId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 10px",
                      borderRadius: 6,
                      background: isUser ? "rgba(34,211,238,0.08)" : rankBg,
                      border: `1px solid ${isUser ? "rgba(34,211,238,0.25)" : "#1e293b"}`,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        borderRadius: 5,
                        background: entry.rank <= 3 ? "#0f172a" : "transparent",
                        color: rankColor,
                        fontSize: 11,
                        fontFamily: "monospace",
                        fontWeight: 800,
                      }}
                    >
                      {entry.rank === 1 ? "🏆" : entry.rank}
                    </span>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          color: isUser ? "#22d3ee" : "#e2e8f0",
                          fontSize: 12,
                          fontFamily: "monospace",
                          fontWeight: 700,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isUser ? "You" : `Agent #${entry.agentId}`}
                      </div>
                      <div style={{ color: "#64748b", fontSize: 10, fontFamily: "monospace" }}>
                        {entry.questsCompleted} quest{entry.questsCompleted !== 1 ? "s" : ""} · {entry.xpFromQuests} XP
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* User's own rank if not in top 3 */}
          {userEntry && userEntry.rank > 3 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1e293b" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 6,
                  background: "rgba(34,211,238,0.08)",
                  border: "1px solid rgba(34,211,238,0.25)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: 5,
                    color: "#22d3ee",
                    fontSize: 11,
                    fontFamily: "monospace",
                    fontWeight: 800,
                  }}
                >
                  {userEntry.rank}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: "#22d3ee", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>
                    You
                  </div>
                  <div style={{ color: "#64748b", fontSize: 10, fontFamily: "monospace" }}>
                    {userEntry.questsCompleted} quest{userEntry.questsCompleted !== 1 ? "s" : ""} · {userEntry.xpFromQuests} XP
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}