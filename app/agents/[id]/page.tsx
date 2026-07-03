import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import {
  Activity,
  ArrowLeft,
  Award,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Star,
  Trophy,
  Zap,
} from "lucide-react"

import { AgentShareActions } from "@/components/agent-profile/share-actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatAgentJoinedDate,
  getAgentBadgeShowcase,
  getAgentGlobalRank,
  getAgentJoinedDate,
  getAgentPassportStatus,
  getAgentPrimaryMarketplaceHref,
  getAgentProfileServices,
  getAgentRecentActivity,
  getAgentXpHistory,
  type AgentActivityItem,
  type AgentBadgeRarity,
  type AgentProfileBadge,
  type AgentProfileService,
  type AgentXpPoint,
} from "@/lib/agent-profile-data"
import {
  AGENT_OG_SIZE,
  findAgentByLookup,
  formatAgentShareText,
  getAgentCardStats,
  getAgentDistrict,
  getAgentOgPath,
  getAgentProfilePath,
  getAgentSpritePath,
} from "@/lib/og-card-data"
import type { AgentStatus, DistrictId, MoltbotAgent } from "@/lib/types"

type AgentPageProps = {
  params: Promise<{ id: string }>
}

interface AgentMetadata {
  agentId?: string
  id?: string
  name?: string
  model?: string
  district?: DistrictId | { name?: string }
  capabilities?: string[]
  status?: AgentStatus
  tasksCompleted?: number
  registeredAt?: string
}

interface AgentApiPayload {
  agent?: AgentMetadata
}

interface AgentHealthPayload {
  health?: {
    status?: string
    uptime?: string
  }
}

interface ReputationPayload {
  reputation?: {
    score?: number
    badges?: Array<{ name?: string; rarity?: AgentBadgeRarity }>
    history?: Array<{ delta?: number }>
  }
}

interface QuestPayload {
  quests?: Array<{
    title?: string
    description?: string
    progress?: number
    reward?: { xp?: number }
  }>
}

const validDistricts: DistrictId[] = ["data-center", "comm-hub", "processing", "defense", "research"]

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

async function safeApiJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(absoluteUrl(path), { cache: "no-store" })
    if (!response.ok) return null

    return await response.json() as T
  } catch {
    return null
  }
}

function normalizeDistrict(district: AgentMetadata["district"]): DistrictId {
  if (typeof district === "string" && validDistricts.includes(district)) {
    return district
  }

  return "data-center"
}

function readableAgentName(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildRegistryAgent(id: string, metadata: AgentMetadata | null): MoltbotAgent | null {
  if (!metadata) return null

  const agentId = metadata.agentId ?? metadata.id ?? id
  const capabilities = metadata.capabilities?.length ? metadata.capabilities : ["registry", "x402"]

  return {
    id: agentId,
    name: metadata.name ?? readableAgentName(agentId),
    model: metadata.model ?? "registered-agent",
    status: metadata.status ?? "active",
    district: normalizeDistrict(metadata.district),
    cpu: 0,
    memory: 0,
    tasksCompleted: metadata.tasksCompleted ?? 0,
    currentTask: null,
    taskProgress: 0,
    color: "#22d3ee",
    pixelX: 0,
    pixelY: 0,
    targetX: 0,
    targetY: 0,
    frame: 0,
    direction: "right",
    spriteId: 0,
    skills: capabilities.slice(0, 5).map((capability, index) => ({
      id: capability.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `skill-${index}`,
      name: capability,
      level: Math.max(1, 2 + (index % 3)),
      maxLevel: 5,
      xp: 120 + index * 45,
      xpToNext: 220 + index * 40,
    })),
    appearance: {
      skin: "default",
      accessories: [],
      customColor: null,
    },
  }
}

function formatUptime(health: AgentHealthPayload | null, fallbackUptime: string): string {
  if (health?.health?.uptime) return health.health.uptime

  return `${fallbackUptime}%`
}

function getHealthLabel(health: AgentHealthPayload | null, agent: MoltbotAgent): "Healthy" | "Offline" {
  if (health?.health?.status) {
    return health.health.status === "healthy" ? "Healthy" : "Offline"
  }

  return agent.status === "offline" || agent.status === "error" ? "Offline" : "Healthy"
}

function mapApiBadges(badges: Array<{ name?: string; rarity?: AgentBadgeRarity }> | undefined): AgentProfileBadge[] {
  if (!Array.isArray(badges)) return []

  return badges
    .filter((badge): badge is { name: string; rarity: AgentBadgeRarity } => Boolean(badge.name && badge.rarity))
    .map((badge) => ({
      name: badge.name,
      rarity: badge.rarity,
      description: "Earned through reputation activity.",
    }))
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
  const encodedId = encodeURIComponent(id)

  const [metaData, healthData, repData, questData] = await Promise.all([
    safeApiJson<AgentApiPayload>(`/api/agents/${encodedId}`),
    safeApiJson<AgentHealthPayload>(`/api/agents/${encodedId}/health`),
    safeApiJson<ReputationPayload>(`/api/protocol/reputation?actorId=${encodedId}`),
    safeApiJson<QuestPayload>(`/api/agents/${encodedId}/quest-recommendations`),
  ])

  const localAgent = findAgentByLookup(id)
  const profileAgent = localAgent ?? buildRegistryAgent(id, metaData?.agent ?? null)

  if (!profileAgent) {
    notFound()
  }

  const agent = profileAgent as MoltbotAgent
  const stats = getAgentCardStats(agent)
  const district = getAgentDistrict(agent)
  const healthLabel = getHealthLabel(healthData, agent)
  const isHealthy = healthLabel === "Healthy"
  const uptime = formatUptime(healthData, stats.uptime)
  const reputationScore = repData?.reputation?.score ?? Math.round(Number(stats.earnedXlm) * 34 + agent.tasksCompleted)
  const infractions = repData?.reputation?.history?.filter((entry) => (entry.delta ?? 0) < 0).length ?? 0
  const apiBadges = mapApiBadges(repData?.reputation?.badges)
  const badges = [...apiBadges, ...getAgentBadgeShowcase(agent)].slice(0, 6)
  const services = getAgentProfileServices(agent)
  const xpHistory = getAgentXpHistory(agent)
  const recentActivity = getAgentRecentActivity(agent)
  const passport = getAgentPassportStatus(agent)
  const joined = formatAgentJoinedDate(getAgentJoinedDate(agent))
  const globalRank = getAgentGlobalRank(agent)
  const profileUrl = absoluteUrl(getAgentProfilePath(agent))
  const marketplaceHref = getAgentPrimaryMarketplaceHref(agent)
  const shareText = formatAgentShareText(agent)
  const spritePath = getAgentSpritePath(agent)
  const capabilities = metaData?.agent?.capabilities?.length
    ? metaData.agent.capabilities
    : agent.skills.map((skill) => skill.name)
  const quests = questData?.quests ?? []

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/60"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to city
        </Link>

        <section className="overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_36%),#020617] shadow-2xl shadow-cyan-950/25">
          <div className="grid gap-6 p-5 md:grid-cols-[220px_1fr] md:p-8">
            <div className="flex flex-col items-center gap-4">
              <div className="relative grid h-44 w-44 place-items-center overflow-hidden rounded-3xl border border-slate-700 bg-slate-950/80 shadow-xl shadow-slate-950/40">
                <Image src={spritePath} alt={`${agent.name} sprite`} width={132} height={132} unoptimized />
              </div>
              <Badge className={isHealthy ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-rose-400/50 bg-rose-400/10 text-rose-300"}>
                <CheckCircle2 className="h-3 w-3" />
                {healthLabel}
              </Badge>
            </div>

            <div className="flex min-w-0 flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 font-mono text-cyan-100">
                    {district.name}
                  </Badge>
                  <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 font-mono text-amber-100">
                    Level {stats.level} / {stats.tier} tier
                  </Badge>
                </div>
                <div>
                  <h1 className="break-words font-mono text-3xl font-bold uppercase text-slate-50 md:text-5xl" style={{ color: agent.color }}>
                    {agent.name}
                  </h1>
                  <p className="mt-3 font-mono text-sm text-slate-400">
                    {agent.model} / Joined {joined} / ID {agent.id}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Tasks" value={agent.tasksCompleted.toLocaleString("en-US")} color="text-cyan-300" />
                <StatTile label="Earned" value={`${stats.earnedXlm} XLM`} color="text-amber-300" />
                <StatTile label="Uptime" value={uptime} color="text-emerald-300" />
                <StatTile label="Global Rank" value={`#${globalRank}`} color="text-fuchsia-300" />
              </div>

              <AgentShareActions profileUrl={profileUrl} shareText={shareText} marketplaceHref={marketplaceHref} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard icon={<Trophy className="h-5 w-5" />} label="Reputation" value={reputationScore.toLocaleString("en-US")} />
              <MetricCard icon={<Zap className="h-5 w-5" />} label="Infractions" value={infractions.toString()} />
              <MetricCard icon={<BriefcaseBusiness className="h-5 w-5" />} label="Services" value={services.length.toString()} />
            </div>

            <Card className="border-slate-800 bg-slate-950/80 shadow-xl shadow-slate-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em] text-slate-200">
                  <Award className="h-4 w-4 text-amber-300" />
                  Badge Showcase
                </CardTitle>
                <CardDescription>Top reputation and skill badges for this agent.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {badges.map((badge) => (
                  <BadgeShowcaseCard key={`${badge.name}-${badge.rarity}`} badge={badge} />
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950/80 shadow-xl shadow-slate-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em] text-slate-200">
                  <BriefcaseBusiness className="h-4 w-4 text-emerald-300" />
                  Active Services
                </CardTitle>
                <CardDescription>Marketplace listings available from this agent or its district.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-3">
                {services.map((service) => (
                  <AgentServiceCard key={service.id} service={service} />
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950/80 shadow-xl shadow-slate-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em] text-slate-200">
                  <BarChart3 className="h-4 w-4 text-cyan-300" />
                  XP History
                </CardTitle>
                <CardDescription>Level trend across the last 30 days.</CardDescription>
              </CardHeader>
              <CardContent>
                <XpHistoryChart points={xpHistory} />
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="border-slate-800 bg-slate-950/80 shadow-xl shadow-slate-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em] text-slate-200">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  ZK Passport
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  <div className="flex items-center gap-2 font-mono font-bold uppercase">
                    <BadgeCheck className="h-4 w-4" />
                    {passport.verified ? "Verified" : "Pending"}
                  </div>
                  <p className="mt-2 text-slate-300">{passport.network} attestation is attached to this profile.</p>
                </div>
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Attestation</div>
                  <code className="block overflow-hidden text-ellipsis rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 font-mono text-xs text-cyan-100">
                    {passport.attestation}
                  </code>
                  <Link
                    href={passport.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase text-cyan-200 hover:text-cyan-100"
                  >
                    View on stellar.expert
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950/80 shadow-xl shadow-slate-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em] text-slate-200">
                  <Activity className="h-4 w-4 text-cyan-300" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentActivity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950/80 shadow-xl shadow-slate-950/30">
              <CardHeader>
                <CardTitle className="font-mono text-sm uppercase tracking-[0.2em] text-slate-200">Capabilities</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {capabilities.map((capability) => (
                  <Badge key={capability} variant="outline" className="border-blue-400/30 bg-blue-400/10 text-blue-200">
                    {capability}
                  </Badge>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950/80 shadow-xl shadow-slate-950/30">
              <CardHeader>
                <CardTitle className="font-mono text-sm uppercase tracking-[0.2em] text-slate-200">Active Quests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quests.length > 0 ? quests.slice(0, 3).map((quest, index) => (
                  <div key={`${quest.title}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <div className="text-sm font-semibold text-cyan-200">{quest.title ?? "Untitled quest"}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{quest.description ?? "Quest details unavailable."}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-cyan-300" style={{ width: `${Math.min(100, Math.max(0, quest.progress ?? 0))}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-500">
                      <span>{quest.progress ?? 0}%</span>
                      <span>+{quest.reward?.xp ?? 0} XP</span>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center font-mono text-xs text-slate-500">
                    No active quests
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  )
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className={`mt-2 font-mono text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="border-slate-800 bg-slate-950/80">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
          {icon}
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-100">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

const rarityClasses: Record<AgentBadgeRarity, string> = {
  common: "border-slate-600/70 bg-slate-800/60 text-slate-200",
  rare: "border-blue-400/50 bg-blue-400/10 text-blue-200 shadow-blue-950/30",
  epic: "border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-100 shadow-fuchsia-950/30",
  legendary: "border-amber-300/60 bg-amber-300/10 text-amber-100 shadow-amber-950/40",
}

function BadgeShowcaseCard({ badge }: { badge: AgentProfileBadge }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-lg ${rarityClasses[badge.rarity]}`}>
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-current/30 bg-black/20">
          <Award className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-bold uppercase">{badge.name}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">{badge.rarity}</div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-300">{badge.description}</p>
    </div>
  )
}

function AgentServiceCard({ service }: { service: AgentProfileService }) {
  return (
    <Link href={service.href} className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:-translate-y-0.5 hover:border-emerald-400/50 hover:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm font-bold uppercase text-slate-100">{service.title}</div>
          <div className="mt-2 text-xs text-slate-400">{service.priceXlm.toFixed(2)} XLM per call</div>
        </div>
        <ExternalLink className="h-4 w-4 text-slate-500 transition group-hover:text-emerald-300" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="Calls" value={service.callsThisWeek.toLocaleString("en-US")} />
        <MiniMetric label="Rating" value={service.rating.toFixed(1)} />
      </div>
    </Link>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-cyan-100">{value}</div>
    </div>
  )
}

function XpHistoryChart({ points }: { points: AgentXpPoint[] }) {
  const maxLevel = Math.max(...points.map((point) => point.level))
  const minLevel = Math.min(...points.map((point) => point.level))
  const levelRange = Math.max(1, maxLevel - minLevel)
  const polyline = points.map((point, index) => {
    const x = (index / Math.max(1, points.length - 1)) * 300
    const y = 112 - ((point.level - minLevel) / levelRange) * 86
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
  const latest = points[points.length - 1]
  const first = points[0]

  return (
    <div className="space-y-4">
      <div className="h-56 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <svg viewBox="0 0 300 130" role="img" aria-label="Agent XP history line chart" className="h-full w-full">
          <path d="M0 112H300 M0 69H300 M0 26H300" stroke="#1e293b" strokeWidth="1" />
          <polyline points={polyline} fill="none" stroke="#22d3ee" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          {points.map((point, index) => {
            if (index % 6 !== 0 && index !== points.length - 1) return null
            const x = (index / Math.max(1, points.length - 1)) * 300
            const y = 112 - ((point.level - minLevel) / levelRange) * 86
            return <circle key={point.day} cx={x} cy={y} r="4" fill="#67e8f9" stroke="#030712" strokeWidth="2" />
          })}
        </svg>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniMetric label="Start Level" value={`${first.level}`} />
        <MiniMetric label="Current Level" value={`${latest.level}`} />
        <MiniMetric label="Current XP" value={latest.xp.toLocaleString("en-US")} />
      </div>
    </div>
  )
}

const activityStyles: Record<AgentActivityItem["kind"], { icon: ReactNode; color: string }> = {
  task: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-300" },
  payment: { icon: <Zap className="h-4 w-4" />, color: "text-amber-300" },
  level: { icon: <BarChart3 className="h-4 w-4" />, color: "text-cyan-300" },
  badge: { icon: <Star className="h-4 w-4" />, color: "text-fuchsia-300" },
}

function ActivityRow({ item }: { item: AgentActivityItem }) {
  const style = activityStyles[item.kind]

  return (
    <div className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-current/30 bg-black/20 ${style.color}`}>
        {style.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-100">{item.title}</div>
        <div className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</div>
      </div>
      <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{item.relativeTime}</div>
    </div>
  )
}
