import type { ReactNode } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getLeaderboardAgent } from "@/lib/leaderboard"

type AgentLeaderboardPageProps = {
  params: Promise<{ agentId: string }>
}

export async function generateMetadata({ params }: AgentLeaderboardPageProps) {
  const { agentId } = await params
  const agent = getLeaderboardAgent(agentId)
  return { title: agent ? `${agent.name} Leaderboard Stats | Open Stellar` : "Agent not found | Open Stellar" }
}

export default async function AgentLeaderboardPage({ params }: AgentLeaderboardPageProps) {
  const { agentId } = await params
  const agent = getLeaderboardAgent(agentId)

  if (!agent) notFound()

  const xpHistory = [62, 68, 71, 77, 82, 89, 100]
  const rankHistory = [agent.globalRank + 4, agent.globalRank + 3, agent.globalRank + 2, agent.globalRank + 2, agent.globalRank + 1, agent.globalRank, agent.globalRank]
  const tasks = ["Settled x402 receipt", "Completed district dispatch", "Verified badge proof", "Routed agent payment"]

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link href="/leaderboard" className="w-fit rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200">
          Back to leaderboard
        </Link>

        <header className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Agent stats</p>
          <h1 className="mt-3 font-pixel text-3xl uppercase" style={{ color: agent.districtColor }}>{agent.name}</h1>
          <p className="mt-3 font-mono text-sm text-slate-400">
            Global #{agent.globalRank} / District #{agent.districtRank} / Level {agent.level} / {agent.tasksCompleted.toLocaleString()} completed tasks
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="XP" value={agent.xp.toLocaleString()} />
          <Stat label="x402 revenue" value={`$${agent.x402Revenue.toFixed(2)}`} />
          <Stat label="Weekly tasks" value={agent.weeklyTasks.toLocaleString()} />
          <Stat label="Badges" value={agent.badges.join(" ")} />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Panel title="XP history chart">
            <div className="flex h-44 items-end gap-2 border-b border-l border-slate-700 p-3">
              {xpHistory.map((point, index) => (
                <div key={index} className="flex-1 rounded-t bg-cyan-300/70" style={{ height: `${point}%` }} title={`${point}%`} />
              ))}
            </div>
          </Panel>
          <Panel title="District rank over time">
            <div className="flex h-44 items-end gap-2 border-b border-l border-slate-700 p-3">
              {rankHistory.map((point, index) => (
                <div key={index} className="flex-1 rounded-t bg-emerald-300/70" style={{ height: `${Math.max(12, 100 - point * 12)}%` }} title={`#${point}`} />
              ))}
            </div>
          </Panel>
        </section>

        <Panel title="Badge collection">
          <div className="flex flex-wrap gap-3 text-3xl">{agent.badges.map((badge) => <span key={badge} className="rounded-xl border border-slate-700 bg-slate-900 p-3">{badge}</span>)}</div>
        </Panel>

        <Panel title="Recent task history">
          <ul className="divide-y divide-slate-800 font-mono text-sm text-slate-300">
            {tasks.map((task, index) => <li key={task} className="py-3">#{index + 1} {task}</li>)}
          </ul>
        </Panel>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4"><div className="font-mono text-xs uppercase text-slate-500">{label}</div><div className="mt-2 font-pixel text-xl text-slate-100">{value}</div></div>
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5"><h2 className="mb-4 font-pixel text-xl uppercase text-slate-100">{title}</h2>{children}</section>
}
