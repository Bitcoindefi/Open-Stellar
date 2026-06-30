import Link from "next/link"
import { notFound } from "next/navigation"
import { CountdownTimer } from "@/components/districts/countdown-timer"
import { DISTRICTS, createAgents } from "@/lib/data"
import { getDistrictLeaderboard, getPreviousDistrictLeaderboardSnapshot } from "@/lib/gamification/district-leaderboard"
import { getActiveDistrictEvent } from "@/lib/gamification/events"
import type { DistrictId } from "@/lib/types"

type DistrictLeaderboardPageProps = {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: DistrictLeaderboardPageProps) {
  const { id } = await params
  const district = DISTRICTS.find((entry) => entry.id === id)
  return {
    title: district ? `${district.name} Leaderboard | Open Stellar` : "District Leaderboard | Open Stellar",
    description: "Current-week Open Stellar district competition rankings.",
  }
}

export default async function DistrictLeaderboardPage({ params }: DistrictLeaderboardPageProps) {
  const { id } = await params
  const district = DISTRICTS.find((entry) => entry.id === id)
  if (!district) notFound()

  const districtId = district.id as DistrictId
  const agents = createAgents()
  const event = getActiveDistrictEvent()
  const entries = getDistrictLeaderboard(agents, districtId)
  const previousSnapshot = getPreviousDistrictLeaderboardSnapshot(districtId)

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <nav className="flex flex-wrap gap-2">
          <Link href="/" className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200">
            Back to city
          </Link>
          <Link href="/leaderboard" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-slate-300">
            Global leaderboard
          </Link>
        </nav>

        <header className="overflow-hidden rounded-2xl border bg-slate-950/80 p-5" style={{ borderColor: `${district.color}66` }}>
          <p className="font-mono text-xs uppercase tracking-[0.28em]" style={{ color: district.color }}>District competition</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-pixel text-3xl uppercase text-slate-100 sm:text-4xl">{district.name} Leaderboard</h1>
              <p className="mt-3 max-w-3xl font-mono text-sm leading-7 text-slate-400">
                Top 10 agents ranked by this week&apos;s {event.challenge.name.toLowerCase()} score. Competition weeks reset every Sunday at 00:00 UTC.
              </p>
            </div>
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-300">Ends at {new Date(event.endsAt).toUTCString()}</p>
              <CountdownTimer endsAt={event.endsAt} />
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-pixel text-2xl uppercase text-slate-100">Current week rankings</h2>
              <p className="font-mono text-xs text-slate-400">Metric: {event.challenge.metric}</p>
            </div>
            <span className="w-fit rounded-full border border-slate-700 px-3 py-1 font-mono text-xs text-slate-300">{event.challenge.scoreLabel}</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-[760px] w-full border-collapse text-left font-mono text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-[0.18em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Agent name</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Tasks completed this week</th>
                  <th className="px-4 py-3">District</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {entries.map((entry) => (
                  <tr key={entry.agentId} className="bg-slate-950/60">
                    <td className="px-4 py-3 text-cyan-200">#{entry.rank}</td>
                    <td className="px-4 py-3 font-semibold text-slate-100">{entry.agentName}</td>
                    <td className="px-4 py-3">{entry.formattedScore}</td>
                    <td className="px-4 py-3">{entry.tasksCompletedThisWeek}</td>
                    <td className="px-4 py-3" style={{ color: district.color }}>{entry.districtName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {previousSnapshot && (
          <section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
            <h2 className="font-pixel text-2xl uppercase text-amber-100">Previous week results</h2>
            <p className="mt-1 font-mono text-xs text-amber-100/70">
              Week {previousSnapshot.weekIndex} · {previousSnapshot.challengeName} · ended {new Date(previousSnapshot.endedAt).toUTCString()}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {previousSnapshot.entries.slice(0, 3).map((entry) => (
                <div key={entry.agentId} className="rounded-xl border border-amber-200/20 bg-slate-950/70 p-4">
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-amber-200">#{entry.rank}</div>
                  <div className="mt-2 font-pixel text-xl uppercase text-slate-100">{entry.agentName}</div>
                  <div className="mt-2 font-mono text-sm text-slate-300">Score: {entry.formattedScore}</div>
                  <div className="font-mono text-xs text-slate-500">Tasks: {entry.tasksCompletedThisWeek}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
