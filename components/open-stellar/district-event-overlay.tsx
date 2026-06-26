"use client"

import type { ActiveDistrictEvent, DistrictStanding } from "@/lib/gamification/events"

interface DistrictEventOverlayProps {
  event: ActiveDistrictEvent | null
  standings: DistrictStanding[]
}

function formatCountdown(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h ${minutes}m`
}

export function DistrictEventOverlay({ event, standings }: DistrictEventOverlayProps) {
  if (!event) return null

  const leader = standings[0]

  return (
    <section
      aria-label="Active district competition"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 6,
        width: 280,
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(34,211,238,0.35)",
        background: "rgba(3,7,18,0.84)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.35)",
        backdropFilter: "blur(8px)",
        fontFamily: "monospace",
      }}
    >
      <div style={{ fontSize: 9, color: "#22d3ee", textTransform: "uppercase", letterSpacing: 1.6, marginBottom: 4 }}>
        Weekly District Event
      </div>
      <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 800, marginBottom: 4 }}>
        {event.challenge.name}
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5, marginBottom: 10 }}>
        {event.challenge.metric} · ends in {formatCountdown(event.secondsRemaining)}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {standings.slice(0, 5).map((standing) => (
          <div key={standing.districtId} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", alignItems: "center", gap: 6 }}>
            <div style={{ color: standing.color, fontSize: 11, fontWeight: 800 }}>#{standing.rank}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#cbd5e1", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {standing.districtName}
              </div>
              <div style={{ height: 4, background: "#111827", borderRadius: 999, overflow: "hidden", marginTop: 3 }}>
                <div
                  style={{
                    width: `${leader ? Math.max(8, Math.min(100, (standing.score / Math.max(leader.score, 0.001)) * 100)) : 0}%`,
                    height: "100%",
                    background: standing.color,
                  }}
                />
              </div>
            </div>
            <div style={{ color: standing.rank <= 2 ? "#fbbf24" : "#64748b", fontSize: 10, fontWeight: 700 }}>
              {standing.formattedScore} {standing.multiplier > 1 ? `${standing.multiplier}×` : ""}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
