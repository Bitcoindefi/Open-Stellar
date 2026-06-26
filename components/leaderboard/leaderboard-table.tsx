"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { DistrictId } from "@/lib/types"
import type { LeaderboardAgent, LeaderboardView } from "@/lib/leaderboard"

type LeaderboardTableProps = {
  initialAgents: LeaderboardAgent[]
  view: LeaderboardView
  district?: DistrictId
}

export function LeaderboardTable({ initialAgents, view, district }: LeaderboardTableProps) {
  const [agents, setAgents] = useState(initialAgents)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ view })
    if (district) params.set("district", district)
    let cancelled = false

    async function refresh() {
      const response = await fetch(`/api/leaderboard?${params.toString()}`, { cache: "no-store" })
      if (!response.ok || cancelled) return
      const payload = await response.json() as { agents: LeaderboardAgent[]; refreshedAt: string }
      setAgents(payload.agents)
      setRefreshedAt(payload.refreshedAt)
    }

    const id = window.setInterval(refresh, 30000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [view, district])

  const title = useMemo(() => view === "week" ? "Tasks this week" : "Total tasks", [view])

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-[0_24px_80px_rgba(2,8,23,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 font-mono text-xs text-slate-400">
        <span>Refreshes every 30s; rank deltas animate with arrows.</span>
        <span>{refreshedAt ? `Updated ${new Date(refreshedAt).toLocaleTimeString()}` : "Live polling ready"}</span>
      </div>
      <div className="divide-y divide-slate-800/80">
        {agents.map((agent) => {
          const delta = agent.previousRank - agent.rank
          return (
            <Link
              key={agent.id}
              href={`/leaderboard/${agent.id}`}
              className="grid grid-cols-[48px_1fr] gap-3 px-4 py-4 transition hover:bg-slate-900/80 md:grid-cols-[60px_72px_1.4fr_1fr_1fr_96px_110px] md:items-center"
            >
              <div className="font-pixel text-xl text-cyan-200">#{agent.rank}</div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-2xl shadow-inner" style={{ boxShadow: `0 0 24px ${agent.districtColor}33` }}>
                🤖
              </div>
              <div>
                <div className="flex items-center gap-2 font-pixel text-lg uppercase text-slate-100">
                  {agent.name}
                  {agent.globalRank <= 3 && <span aria-label="top-three crown">🏆</span>}
                </div>
                <div className="mt-1 font-mono text-xs text-slate-500">Sprite #{agent.spriteId + 1}</div>
              </div>
              <div className="font-mono text-sm" style={{ color: agent.districtColor }}>{agent.districtName}</div>
              <div className="font-mono text-sm text-slate-200">{(view === "week" ? agent.weeklyTasks : agent.tasksCompleted).toLocaleString()} {title.toLowerCase()}</div>
              <div className="font-mono text-sm text-slate-300">Level {agent.level}</div>
              <div className="flex items-center justify-between gap-2 font-mono text-sm text-slate-300">
                <span>{agent.badges.join(" ")}</span>
                <span className={delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-500"}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
