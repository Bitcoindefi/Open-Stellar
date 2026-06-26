import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
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
  const agent = findAgentByLookup(id)

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
  const agent = findAgentByLookup(id)

  if (!agent) {
    notFound()
  }

  const stats = getAgentCardStats(agent)
  const district = getAgentDistrict(agent)

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
            <Link
              href={`/credential/${encodeURIComponent(agent.id)}`}
              className="mt-4 inline-flex w-fit rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-emerald-200 transition hover:border-emerald-300/60"
            >
              Reputation credential
            </Link>
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
      </div>
    </main>
  )
}
