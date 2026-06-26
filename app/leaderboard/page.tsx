import Link from "next/link"
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table"
import { DISTRICTS } from "@/lib/data"
import { listLeaderboardAgents, type LeaderboardView } from "@/lib/leaderboard"
import type { DistrictId } from "@/lib/types"

type LeaderboardPageProps = {
  searchParams: Promise<{ view?: LeaderboardView; district?: DistrictId }>
}

export const metadata = {
  title: "Leaderboard | Open Stellar",
  description: "Global, district, and weekly Open Stellar agent rankings.",
}

function isView(value: string | undefined): value is LeaderboardView {
  return value === "global" || value === "district" || value === "week"
}

function href(view: LeaderboardView, district?: DistrictId) {
  const params = new URLSearchParams({ view })
  if (district) params.set("district", district)
  return `/leaderboard?${params.toString()}`
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const params = await searchParams
  const view = isView(params.view) ? params.view : "global"
  const activeDistrict = DISTRICTS.some((district) => district.id === params.district) ? params.district : DISTRICTS[0].id
  const agents = listLeaderboardAgents(view, view === "district" ? activeDistrict : undefined)
  const leaders = listLeaderboardAgents("global").slice(0, 3)

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Link href="/" className="w-fit rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200">
          Back to city
        </Link>

        <header className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Gamification epic</p>
          <h1 className="mt-3 font-pixel text-3xl uppercase text-slate-100">Agent Leaderboard</h1>
          <p className="mt-3 max-w-3xl font-mono text-sm leading-7 text-slate-400">
            Global and per-district rankings by completed tasks, with a weekly board that resets Sunday at 00:00 UTC.
          </p>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {leaders.map((agent) => (
            <Link key={agent.id} href={`/leaderboard/${agent.id}`} className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <div className="text-2xl">🏆 #{agent.rank}</div>
              <div className="mt-2 font-pixel text-xl uppercase" style={{ color: agent.districtColor }}>{agent.name}</div>
              <div className="mt-1 font-mono text-xs text-slate-400">Crown overlay active on city canvas</div>
            </Link>
          ))}
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="Leaderboard views">
          {(["global", "district", "week"] as const).map((item) => (
            <Link key={item} href={href(item, activeDistrict)} className={`rounded-md border px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] ${view === item ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
              {item === "week" ? "This Week" : item}
            </Link>
          ))}
        </nav>

        {view === "district" && (
          <nav className="flex flex-wrap gap-2" aria-label="District leaderboard tabs">
            {DISTRICTS.map((district) => (
              <Link key={district.id} href={href("district", district.id)} className="rounded-md border px-3 py-2 font-mono text-xs" style={{ borderColor: `${district.color}55`, background: activeDistrict === district.id ? `${district.color}22` : "#0f172a", color: activeDistrict === district.id ? district.color : "#94a3b8" }}>
                {district.name}
              </Link>
            ))}
          </nav>
        )}

        <LeaderboardTable initialAgents={agents} view={view} district={view === "district" ? activeDistrict : undefined} />
      </div>
    </main>
  )
}
