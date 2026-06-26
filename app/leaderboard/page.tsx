import Link from "next/link"
import { DISTRICTS, createAgents } from "@/lib/data"
import { getLeaderboardRows } from "@/lib/gamification/progression"
import { getAgentProfilePath } from "@/lib/og-card-data"

export const metadata = {
  title: "Leaderboard - Open Stellar",
  description: "Global and district rankings for Open Stellar agents by completed tasks.",
}

export default function LeaderboardPage() {
  const agents = createAgents()
  const rows = getLeaderboardRows(agents)

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Open Stellar</p>
            <h1 className="mt-2 font-pixel text-3xl uppercase">Agent Leaderboard</h1>
            <p className="mt-2 font-mono text-sm text-slate-400">Ranked by tasks completed, with quest badges and Soroban attestation IDs for top agents.</p>
          </div>
          <Link href="/" className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/60">
            Back to city
          </Link>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
          <div className="grid grid-cols-[72px_1fr_140px_150px_1fr] gap-3 border-b border-slate-800 px-4 py-3 font-mono text-xs uppercase tracking-[0.16em] text-slate-500">
            <span>Rank</span>
            <span>Agent</span>
            <span>District</span>
            <span>Tasks</span>
            <span>Badges</span>
          </div>
          {rows.map((row) => {
            const district = DISTRICTS.find((candidate) => candidate.id === row.agent.district)
            return (
              <Link key={row.agent.id} href={getAgentProfilePath(row.agent)} className="grid grid-cols-[72px_1fr_140px_150px_1fr] gap-3 border-b border-slate-900 px-4 py-4 font-mono text-sm transition hover:bg-slate-900/70">
                <span className="text-cyan-200">#{row.rank}</span>
                <span className="font-bold" style={{ color: row.agent.color }}>{row.agent.name}</span>
                <span className="text-slate-300">{district?.name ?? row.agent.district}</span>
                <span className="text-emerald-300">{row.agent.tasksCompleted.toLocaleString("en-US")}</span>
                <span className="truncate text-slate-400">{row.badges.length > 0 ? row.badges.map((badge) => badge.name).join(" • ") : "No badges yet"}</span>
              </Link>
            )
          })}
        </section>
      </div>
    </main>
  )
}
