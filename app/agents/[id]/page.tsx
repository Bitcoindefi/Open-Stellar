import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

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
  
  // Data loading as required by acceptance criteria
  const [metaRes, healthRes, repRes, questRes] = await Promise.all([
    fetch(absoluteUrl(`/api/agents/${id}`), { cache: 'no-store' }),
    fetch(absoluteUrl(`/api/agents/${id}/health`), { cache: 'no-store' }),
    fetch(absoluteUrl(`/api/protocol/reputation?actorId=${id}`), { cache: 'no-store' }),
    fetch(absoluteUrl(`/api/agents/${id}/quest-recommendations`), { cache: 'no-store' })
  ])

  const localAgent = findAgentByLookup(id)
  if (!metaRes.ok && !localAgent) {
    notFound()
  }

  // Parse Metadata
  let agentMetadata: any = null
  let capabilities: string[] = []
  if (metaRes.ok) {
    const data = await metaRes.json()
    agentMetadata = data.agent
    capabilities = agentMetadata.capabilities || []
  } else {
    agentMetadata = localAgent
    capabilities = localAgent?.skills?.map((s: any) => s.name) || []
  }

  // Parse Health
  let isHealthy = false
  let uptime = "0s"
  if (healthRes.ok) {
    const data = await healthRes.json()
    isHealthy = data.health?.status === 'healthy'
    uptime = data.health?.uptime || "0s"
  } else if (localAgent) {
    isHealthy = true
    uptime = `${getAgentCardStats(localAgent).uptime}%`
  }

  // Parse Reputation
  let repScore = 0
  let badges: any[] = []
  let infractions = 0
  if (repRes.ok) {
    const data = await repRes.json()
    repScore = data.reputation?.score || 0
    badges = data.reputation?.badges || []
    infractions = data.reputation?.history?.filter((h: any) => h.delta < 0).length || 0
  }

  // Parse Quests
  let quests: any[] = []
  if (questRes.ok) {
    const data = await questRes.json()
    quests = data.quests || []
  }

  const agentName = agentMetadata.name || agentMetadata.agentId || 'Unknown Agent'
  const initials = agentName.substring(0, 2).toUpperCase()
  const agentIdStr = agentMetadata.agentId || agentMetadata.id || id
  const tasksCompleted = agentMetadata.tasksCompleted ?? localAgent?.tasksCompleted ?? 0
  
  let districtName = "Unknown"
  if (agentMetadata.district) {
    districtName = typeof agentMetadata.district === 'string' ? agentMetadata.district : agentMetadata.district.name
  } else if (localAgent) {
    districtName = getAgentDistrict(localAgent).name
  }

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link
          href="/"
          className="w-fit rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/60"
        >
          Back to city
        </Link>
        
        {/* Header Section */}
        <Card className="bg-slate-950/80 border-slate-800 shadow-[0_24px_80px_rgba(2,8,23,0.45)]">
          <CardHeader className="flex flex-col sm:flex-row items-center gap-6 pb-6">
            <Avatar className="h-24 w-24 border-2 border-slate-800 bg-slate-900 flex-shrink-0">
              <AvatarImage src={`/sprites/robot-blue.gif`} alt={agentName} className="object-cover" />
              <AvatarFallback className="bg-slate-800 text-2xl font-mono text-cyan-300">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2 items-center sm:items-start flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <h1 className="font-pixel text-2xl sm:text-3xl uppercase text-slate-100" style={{ color: localAgent?.color }}>{agentName}</h1>
                <Badge variant={isHealthy ? "default" : "destructive"} className={isHealthy ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : ""}>
                  {isHealthy ? "Healthy" : "Offline"}
                </Badge>
              </div>
              <p className="font-mono text-sm text-slate-400 mt-1">ID: {agentIdStr}</p>
              <div className="flex items-center gap-2 font-mono text-xs text-cyan-400/80 mt-2 bg-cyan-950/30 px-3 py-1.5 rounded-full border border-cyan-900/50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {districtName}
              </div>
            </div>
            <Link 
              href={`/credential/${encodeURIComponent(agentIdStr)}`} 
              className="mt-2 sm:mt-0 w-fit rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-emerald-200 transition hover:border-emerald-300/60"
            >
              View Credential
            </Link>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 flex flex-col gap-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="bg-slate-950/80 border-slate-800">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-xs text-slate-400 mb-1">Reputation</span>
                  <span className="font-pixel text-2xl text-amber-400">{repScore}</span>
                </CardContent>
              </Card>
              <Card className="bg-slate-950/80 border-slate-800">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-xs text-slate-400 mb-1">Tasks Done</span>
                  <span className="font-pixel text-2xl text-cyan-400">{tasksCompleted}</span>
                </CardContent>
              </Card>
              <Card className="bg-slate-950/80 border-slate-800">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-xs text-slate-400 mb-1">Uptime</span>
                  <span className="font-pixel text-2xl text-emerald-400">{uptime}</span>
                </CardContent>
              </Card>
              <Card className="bg-slate-950/80 border-slate-800">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-xs text-slate-400 mb-1">Infractions</span>
                  <span className="font-pixel text-2xl text-rose-400">{infractions}</span>
                </CardContent>
              </Card>
            </div>

            {/* Capabilities */}
            <Card className="bg-slate-950/80 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono uppercase tracking-wider text-sm text-slate-300">Capabilities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {capabilities.length > 0 ? capabilities.map((cap, i) => (
                    <Badge key={i} variant="outline" className="bg-blue-900/20 text-blue-300 border-blue-800/50 hover:bg-blue-900/40 px-3 py-1 text-xs">
                      {cap}
                    </Badge>
                  )) : (
                    <span className="text-sm text-slate-500 font-mono">No capabilities registered</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Badges */}
            <Card className="bg-slate-950/80 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono uppercase tracking-wider text-sm text-slate-300">Earned Badges</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {badges.length > 0 ? badges.map((badge, i) => (
                    <div key={i} className={`flex flex-col items-center justify-center p-3 rounded-lg border ${badge.rarity === 'legendary' ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : badge.rarity === 'rare' ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-slate-700 bg-slate-800/50 text-slate-300'}`}>
                      <span className="font-pixel text-xs text-center leading-tight">{badge.name}</span>
                    </div>
                  )) : (
                    <div className="col-span-2 sm:col-span-3 text-center p-4">
                      <span className="text-sm text-slate-500 font-mono">No badges earned yet</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Quests (Sidebar) */}
          <div className="flex flex-col gap-4">
            <h3 className="font-mono uppercase tracking-wider text-sm text-slate-300 mb-1 md:ml-1">Active Quests</h3>
            {quests.length > 0 ? quests.slice(0, 3).map((quest, i) => (
              <Card key={i} className="bg-slate-950/80 border-slate-800 overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                  <div className="h-full bg-cyan-400" style={{ width: `${quest.progress || 0}%` }}></div>
                </div>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm text-cyan-300 leading-tight">{quest.title}</CardTitle>
                  <CardDescription className="text-xs text-slate-400 line-clamp-2 mt-1">{quest.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-4">
                  <div className="flex justify-between items-center text-xs font-mono mt-2 pt-2 border-t border-slate-800/50">
                    <span className="text-slate-500">{quest.progress || 0}%</span>
                    <span className="text-amber-400/80">+{quest.reward?.xp || 0} XP</span>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <Card className="bg-slate-950/80 border-slate-800 border-dashed">
                <CardContent className="p-6 text-center">
                  <span className="text-sm text-slate-500 font-mono">No active quests</span>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

