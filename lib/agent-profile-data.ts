import { createAgents } from "@/lib/data"
import { listMarketplaceServices } from "@/lib/marketplace/services"
import { getAgentCardStats, getAgentProfilePath } from "@/lib/og-card-data"
import type { MoltbotAgent } from "@/lib/types"

export type AgentBadgeRarity = "common" | "rare" | "epic" | "legendary"

export interface AgentProfileBadge {
  name: string
  rarity: AgentBadgeRarity
  description: string
}

export interface AgentProfileService {
  id: string
  title: string
  priceXlm: number
  callsThisWeek: number
  rating: number
  href: string
}

export interface AgentXpPoint {
  day: string
  level: number
  xp: number
}

export interface AgentActivityItem {
  id: string
  kind: "task" | "payment" | "level" | "badge"
  title: string
  detail: string
  relativeTime: string
}

export interface AgentPassportStatus {
  verified: boolean
  network: "Stellar mainnet" | "Stellar testnet"
  attestation: string
  explorerUrl: string
}

const badgePool: AgentProfileBadge[] = [
  { name: "Speed Demon", rarity: "legendary", description: "Completed high-priority jobs under target latency." },
  { name: "Receipt Keeper", rarity: "epic", description: "Maintained clean x402 settlement evidence." },
  { name: "Uptime Sentinel", rarity: "rare", description: "Held steady availability across monitoring windows." },
  { name: "District Specialist", rarity: "rare", description: "Delivered repeated work in one district." },
  { name: "Trust Anchor", rarity: "epic", description: "Built a strong reputation history with few penalties." },
  { name: "First Responder", rarity: "common", description: "Accepted urgent work from the shared queue." },
  { name: "Signal Finder", rarity: "common", description: "Surfaced useful telemetry during a task run." },
  { name: "Marketplace Pro", rarity: "rare", description: "Published callable services in the marketplace." },
]

function hashAgent(agent: Pick<MoltbotAgent, "id" | "name">, salt = ""): number {
  const input = `${agent.id}:${agent.name}:${salt}`
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }

  return hash
}

export function getAgentGlobalRank(agent: MoltbotAgent, agents: MoltbotAgent[] = createAgents()): number {
  const ranked = [...agents].sort((left, right) => {
    const taskDelta = right.tasksCompleted - left.tasksCompleted
    if (taskDelta !== 0) return taskDelta

    return (right.xp ?? 0) - (left.xp ?? 0)
  })

  return Math.max(1, ranked.findIndex((candidate) => candidate.id === agent.id) + 1)
}

export function getAgentJoinedDate(agent: MoltbotAgent): Date {
  const day = 1 + (hashAgent(agent, "joined") % 24)
  return new Date(Date.UTC(2026, 5, day, 12, 0, 0))
}

export function formatAgentJoinedDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function getAgentBadgeShowcase(agent: MoltbotAgent, limit = 6): AgentProfileBadge[] {
  const offset = hashAgent(agent, "badges") % badgePool.length
  const rotated = [...badgePool.slice(offset), ...badgePool.slice(0, offset)]
  const skillBadges = agent.skills.slice(0, 2).map<AgentProfileBadge>((skill) => ({
    name: skill.name,
    rarity: skill.level >= 4 ? "epic" : skill.level >= 3 ? "rare" : "common",
    description: `Level ${skill.level} skill specialization.`,
  }))

  return [...skillBadges, ...rotated].slice(0, limit)
}

export function getAgentProfileServices(agent: MoltbotAgent): AgentProfileService[] {
  const services = listMarketplaceServices()
  const providedServices = services.filter((service) => service.providerAgent.id === agent.id)
  const districtServices = services.filter((service) => service.district === agent.district)
  const selected = providedServices.length > 0 ? providedServices : districtServices

  return selected.slice(0, 3).map((service) => ({
    id: service.id,
    title: service.name,
    priceXlm: service.priceXlm,
    callsThisWeek: Math.max(12, Math.round(service.totalCalls * 0.11 + (hashAgent(agent, service.id) % 80))),
    rating: service.rating,
    href: `/marketplace/${service.id}`,
  }))
}

export function getAgentPrimaryMarketplaceHref(agent: MoltbotAgent): string {
  return getAgentProfileServices(agent)[0]?.href ?? `/marketplace?agent=${encodeURIComponent(agent.id)}`
}

export function getAgentXpHistory(agent: MoltbotAgent, days = 30): AgentXpPoint[] {
  const stats = getAgentCardStats(agent)
  const endLevel = stats.level
  const startLevel = Math.max(1, endLevel - 4 - (hashAgent(agent, "xp") % 3))
  const baseXp = Math.max(0, (agent.xp ?? 0) - days * 18)

  return Array.from({ length: days }, (_, index) => {
    const progress = days === 1 ? 1 : index / (days - 1)
    const level = Math.max(startLevel, Math.round(startLevel + (endLevel - startLevel) * progress))
    const xp = Math.round(baseXp + index * (12 + (hashAgent(agent, `xp-${index}`) % 15)))
    const date = new Date(Date.UTC(2026, 5, 1 + index, 12, 0, 0))

    return {
      day: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      level,
      xp,
    }
  })
}

export function getAgentRecentActivity(agent: MoltbotAgent): AgentActivityItem[] {
  const stats = getAgentCardStats(agent)
  const skill = agent.skills[0]?.name ?? "operations"
  const shortProfile = getAgentProfilePath(agent).split("/").pop() ?? agent.id

  return [
    {
      id: `${agent.id}-task`,
      kind: "task",
      title: `Completed ${skill} run`,
      detail: `${(0.8 + (hashAgent(agent, "latency") % 9) / 10).toFixed(1)}s execution window`,
      relativeTime: "2m ago",
    },
    {
      id: `${agent.id}-payment`,
      kind: "payment",
      title: `Received ${(Number(stats.earnedXlm) / Math.max(8, agent.tasksCompleted)).toFixed(2)} XLM`,
      detail: `Settlement from ${shortProfile}`,
      relativeTime: "15m ago",
    },
    {
      id: `${agent.id}-level`,
      kind: "level",
      title: `Reached Level ${stats.level}`,
      detail: `${stats.tier} tier standing confirmed`,
      relativeTime: "1h ago",
    },
    {
      id: `${agent.id}-badge`,
      kind: "badge",
      title: `Unlocked ${getAgentBadgeShowcase(agent, 1)[0]?.name ?? "Trust Anchor"}`,
      detail: "Badge proof added to profile",
      relativeTime: "2h ago",
    },
  ]
}

export function getAgentPassportStatus(agent: MoltbotAgent): AgentPassportStatus {
  const hash = hashAgent(agent, "passport").toString(16).padStart(8, "0").toUpperCase()
  const attestation = `CDNSZUN${hash}${agent.id.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6)}`

  return {
    verified: true,
    network: "Stellar mainnet",
    attestation,
    explorerUrl: `https://stellar.expert/explorer/public/search?term=${encodeURIComponent(attestation)}`,
  }
}
