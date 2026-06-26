import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getEarnedBadges } from "@/lib/gamification/progression"
import { createAgents } from "@/lib/data"
import {
  AGENT_OG_SIZE,
  findAgentByLookup,
  getAgentCardStats,
  getAgentDistrict,
  getAgentOgPath,
  getAgentProfilePath,
} from "@/lib/og-card-data"

type AgentPageProps = {
  params: Promise<{ id: string }>
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  return "http://localhost:3000"
}

function absoluteUrl(path: string): string {
  return new URL(path, getBaseUrl()).toString()
}

export async function generateMetadata({ params }: AgentPageProps): Promise<Metadata> {
  const { id } = await params
  const agents = createAgents()
  const agent = findAgentByLookup(id, agents)

  if (!agent) {
    return {
      title: "Agent not found - Open Stellar",
    }
  }

  const stats = getAgentCardStats(agent)
  const district = getAgentDistrict(agent)
  const profileUrl = absoluteUrl(getAgentProfilePath(agent))
  const ogImage = absoluteUrl(getAgentOgPath(agent))
  const title = `${agent.name} - Open Stellar Agent`
  const description = `Level ${stats.level} ${stats.tier} agent in ${district.name} with ${agent.tasksCompleted.toLocaleString("en-US")} completed tasks.`

  return {
    title,
    description,
    alternates: {
      canonical: profileUrl,
    },
    openGraph: {
      title,
      description,
      url: profileUrl,
      type: "profile",
      images: [
        {
          url: ogImage,
          width: AGENT_OG_SIZE.width,
          height: AGENT_OG_SIZE.height,
          alt: `${agent.name} Open Stellar agent card`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { id } = await params
  const agents = createAgents()
  const agent = findAgentByLookup(id, agents)

  if (!agent) {
    notFound()
  }

  const stats = getAgentCardStats(agent)
  const district = getAgentDistrict(agent)
  const badges = getEarnedBadges(agent, agents)

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link
          href="/"
          className="w-fit rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/60"
        >
          Back to city
        </Link>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-[0_24px_80px_rgba(2,8,23,0.45)] sm:p-5">
          <div className="mb-5">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Open Stellar agent</p>
            <h1 className="mt-3 font-pixel text-2xl uppercase text-slate-100 sm:text-3xl" style={{ color: agent.color }}>
              {agent.name}
            </h1>
            <p className="mt-3 font-mono text-sm text-slate-400">
              Level {stats.level} / {stats.tier} / {district.name}
            </p>
          </div>

          <Image
            src={getAgentOgPath(agent)}
            alt={`${agent.name} Open Stellar share card`}
            width={AGENT_OG_SIZE.width}
            height={AGENT_OG_SIZE.height}
            priority
            unoptimized
            className="w-full rounded-xl border border-slate-800 bg-slate-900"
          />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-purple-300">Daily quest rewards</p>
              <h2 className="mt-2 font-pixel text-xl uppercase text-slate-100">Badges</h2>
            </div>
            <Link href="/leaderboard" className="rounded-md border border-purple-400/30 bg-purple-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-purple-200">
              Leaderboard
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((badge) => (
              <div key={badge.id} className="rounded-xl border border-purple-400/20 bg-purple-400/10 p-4">
                <div className="font-mono text-sm font-bold text-purple-100">{badge.name}</div>
                <p className="mt-2 font-mono text-xs text-slate-400">{badge.description}</p>
                <p className="mt-3 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-purple-300" title={badge.onChainAttestation}>
                  {badge.onChainAttestation}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
