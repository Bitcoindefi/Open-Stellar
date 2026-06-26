import { DISTRICTS, createAgents } from "@/lib/data"
import {
  findAgentByLookup,
  getAgentDistrict,
  getAgentSpritePath,
  slugifyAgent,
} from "@/lib/og-card-data"
import type { PublishedSystemEvent } from "@/lib/events/system-events"
import type { DistrictId, MoltbotAgent } from "@/lib/types"

export type FeedEventKind = "payment" | "level-up" | "badge" | "district" | "task"

export interface FeedEvent {
  id: string
  kind: FeedEventKind
  agentId?: string
  agentName?: string
  agentSlug?: string
  districtId?: DistrictId
  districtName?: string
  spritePath?: string
  title: string
  detail: string
  highlight: string
  occurredAt: string
  shareText: string
}

export interface FeedQuery {
  kind?: FeedEventKind | "all"
  agent?: string
  district?: DistrictId | "all"
  cursor?: string
  limit?: number
}

export const FEED_EVENT_KINDS: FeedEventKind[] = ["payment", "level-up", "badge", "district", "task"]

const now = Date.now()

function minutesAgo(minutes: number) {
  return new Date(now - minutes * 60_000).toISOString()
}

function eventForAgent(
  agent: MoltbotAgent,
  kind: FeedEventKind,
  title: string,
  detail: string,
  highlight: string,
  occurredAt: string,
): FeedEvent {
  const district = getAgentDistrict(agent)

  return {
    id: `${kind}-${slugifyAgent(agent)}`,
    kind,
    agentId: agent.id,
    agentName: agent.name,
    agentSlug: slugifyAgent(agent),
    districtId: district.id,
    districtName: district.name,
    spritePath: getAgentSpritePath(agent),
    title,
    detail,
    highlight,
    occurredAt,
    shareText: `${title} - ${detail}`,
  }
}

function buildSeedEvents(): FeedEvent[] {
  const agents = createAgents()
  const [nexus, cipher, pulse, vector, halo, stratos] = agents

  return [
    eventForAgent(
      nexus,
      "level-up",
      `${nexus.name} reached Level 42`,
      `${getAgentDistrict(nexus).name} - 1,234 tasks completed`,
      "Level milestone",
      minutesAgo(2),
    ),
    eventForAgent(
      cipher,
      "payment",
      `${cipher.name} earned 0.5 XLM from threat-analysis`,
      "Largest single payment this hour - 86.2 XLM lifetime",
      "Payment received",
      minutesAgo(5),
    ),
    {
      id: "district-processing-tier-3",
      kind: "district",
      districtId: "processing",
      districtName: "Processing",
      title: "Processing district upgraded to Tier 3",
      detail: "50,000 XP milestone reached",
      highlight: "District event",
      occurredAt: minutesAgo(60),
      shareText: "Processing district upgraded to Tier 3 on Open Stellar",
    } satisfies FeedEvent,
    eventForAgent(
      vector,
      "badge",
      `${vector.name} unlocked Speed Demon`,
      "Task completed in 0.8s",
      "Badge unlocked",
      minutesAgo(120),
    ),
    {
      id: "district-comm-hub-throughput-race",
      kind: "district",
      districtId: "comm-hub",
      districtName: "Comm Hub",
      title: "Comm Hub wins this week's Throughput Race",
      detail: "+2x XP bonus for all Comm Hub agents for 24h",
      highlight: "Weekly winner",
      occurredAt: minutesAgo(180),
      shareText: "Comm Hub wins this week's Throughput Race on Open Stellar",
    } satisfies FeedEvent,
    eventForAgent(
      pulse,
      "task",
      `${pulse.name} finished model fine-tune`,
      `${getAgentDistrict(pulse).name} pipeline completed without retries`,
      "Task completed",
      minutesAgo(240),
    ),
    eventForAgent(
      halo,
      "payment",
      `${halo.name} settled 0.12 XLM for dataset cleanup`,
      "x402 receipt verified on Stellar testnet",
      "Receipt verified",
      minutesAgo(320),
    ),
    eventForAgent(
      stratos,
      "badge",
      `${stratos.name} unlocked Relay Captain`,
      "100 successful cross-district handoffs",
      "Rare badge",
      minutesAgo(420),
    ),
  ].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

export const FEED_FILTERS: { id: FeedQuery["kind"]; label: string }[] = [
  { id: "all", label: "All events" },
  { id: "payment", label: "Payments" },
  { id: "level-up", label: "Level-ups" },
  { id: "badge", label: "Badges" },
  { id: "district", label: "District events" },
  { id: "task", label: "Tasks" },
]

export function isFeedEventKind(value: string | null | undefined): value is FeedEventKind {
  return !!value && FEED_EVENT_KINDS.includes(value as FeedEventKind)
}

export function isDistrictId(value: string | null | undefined): value is DistrictId {
  return !!value && DISTRICTS.some((district) => district.id === value)
}

export function listFeedEvents(query: FeedQuery = {}): FeedEvent[] {
  const limit = Math.max(1, Math.min(query.limit ?? 25, 100))
  const normalizedAgent = query.agent ? findAgentByLookup(query.agent) : null
  const kind = query.kind && query.kind !== "all" ? query.kind : null
  const district = query.district && query.district !== "all" ? query.district : null
  const cursorTime = query.cursor ? Date.parse(query.cursor) : Number.NaN

  return buildSeedEvents()
    .filter((event) => !kind || event.kind === kind)
    .filter((event) => !district || event.districtId === district)
    .filter((event) => !normalizedAgent || event.agentId === normalizedAgent.id)
    .filter((event) => Number.isNaN(cursorTime) || Date.parse(event.occurredAt) < cursorTime)
    .slice(0, limit)
}

export function getFeedEventById(eventId: string): FeedEvent | null {
  return buildSeedEvents().find((event) => event.id === eventId) ?? null
}

export function feedEventUrl(event: Pick<FeedEvent, "id">) {
  return `/feed/${encodeURIComponent(event.id)}`
}

export function feedAgentUrl(event: Pick<FeedEvent, "agentSlug">) {
  return event.agentSlug ? `/agents/${event.agentSlug}` : "/feed"
}

export function feedDistrictName(districtId?: DistrictId) {
  return DISTRICTS.find((district) => district.id === districtId)?.name ?? "All districts"
}

export function feedEventFromSystemEvent(event: PublishedSystemEvent): FeedEvent {
  const agent = event.agentId ? findAgentByLookup(event.agentId) : undefined
  const district = agent ? getAgentDistrict(agent) : undefined
  const base = {
    id: event.id,
    agentId: event.agentId,
    agentName: agent?.name ?? event.agentId,
    agentSlug: agent ? slugifyAgent(agent) : undefined,
    districtId: district?.id,
    districtName: district?.name,
    spritePath: agent ? getAgentSpritePath(agent) : undefined,
    occurredAt: event.occurredAt,
  }

  if (event.type === "payment.received") {
    const amount = event.receipt.amountUsd ? `$${event.receipt.amountUsd.toFixed(3)}` : event.receipt.chain
    return {
      ...base,
      kind: "payment",
      title: `${base.agentName} received a payment`,
      detail: `${amount} settled with tx ${event.receipt.txHash.slice(0, 12)}...`,
      highlight: "Payment received",
      shareText: `${base.agentName} received a payment on Open Stellar`,
    }
  }

  if (event.type === "agent.xp") {
    return {
      ...base,
      kind: "level-up",
      title: `${base.agentName} reached Level ${event.level}`,
      detail: `+${event.xp} XP earned in ${base.districtName ?? "Open Stellar"}`,
      highlight: "Level-up",
      shareText: `${base.agentName} reached Level ${event.level} on Open Stellar`,
    }
  }

  if (event.type === "badge.unlocked") {
    return {
      ...base,
      kind: "badge",
      title: `${base.agentName} unlocked ${event.badge.name}`,
      detail: `${event.badge.rarity ?? "common"} badge unlocked`,
      highlight: "Badge unlocked",
      shareText: `${base.agentName} unlocked ${event.badge.name} on Open Stellar`,
    }
  }

  if (event.type === "task.completed") {
    return {
      ...base,
      kind: "task",
      title: `${base.agentName} completed a task`,
      detail: event.result.summary,
      highlight: "Task completed",
      shareText: `${base.agentName} completed a task on Open Stellar`,
    }
  }

  if (event.type === "district.unlocked") {
    const districtName = event.district?.name ?? feedDistrictName(event.districtId)
    return {
      ...base,
      kind: "district",
      districtId: event.districtId ?? event.district?.id,
      districtName,
      title: `${districtName} unlocked`,
      detail: `New district available on Open Stellar`,
      highlight: "District unlocked",
      shareText: `${districtName} unlocked on Open Stellar`,
    }
  }

  if (event.type === "agent.registry") {
    return {
      ...base,
      kind: "task",
      districtId: event.agent.district,
      districtName: feedDistrictName(event.agent.district),
      title: `${event.agent.agentId} registry ${event.action}`,
      detail: `${event.agent.capabilities.length} capabilities declared`,
      highlight: "Registry update",
      shareText: `${event.agent.agentId} updated its registry manifest on Open Stellar`,
    }
  }

  return {
    ...base,
    kind: "task",
    title: `${base.agentName} activity update`,
    detail: event.type === "task.started" ? event.task.title : `Status changed to ${event.status}`,
    highlight: event.type,
    shareText: `${base.agentName} activity update on Open Stellar`,
  }
}
