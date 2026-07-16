import { NextResponse } from "next/server"
import { getRegisteredAgent } from "@/lib/agent-registry"
import { getReputation } from "@/lib/reputation/reputation-store"
import { getBadgeCatalogEntry, BADGE_RARITY_VALUES, type BadgeRarity } from "@/lib/gamification/badge-catalog"
import { getBadgeDefinition, listEarnedBadges } from "@/lib/gamification/badges"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  const agent = getRegisteredAgent(agentId)
  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  const rarityFilter = new URL(req.url).searchParams.get("rarity")
  if (rarityFilter !== null && !(BADGE_RARITY_VALUES as readonly string[]).includes(rarityFilter)) {
    return NextResponse.json(
      { ok: false, error: `invalid rarity "${rarityFilter}"; must be one of: ${BADGE_RARITY_VALUES.join(", ")}` },
      { status: 400 },
    )
  }

  const { metrics } = getReputation(agentId)
  const storedBadges = listEarnedBadges(agentId).map((b) => ({ id: b.badgeId, awardedAt: b.earnedAt }))
  const merged = new Map<string, { id: string; awardedAt: string; rarity?: BadgeRarity }>()

  for (const b of metrics.badges ?? []) {
    merged.set(b.id, { id: b.id, awardedAt: b.awardedAt, rarity: b.rarity as BadgeRarity })
  }
  for (const b of storedBadges) {
    const existing = merged.get(b.id)
    if (!existing || new Date(b.awardedAt).getTime() > new Date(existing.awardedAt).getTime()) {
      merged.set(b.id, b)
    }
  }

  let badges = Array.from(merged.values())
    .map((b) => {
      const definition = getBadgeDefinition(b.id)
      const catalog = getBadgeCatalogEntry(b.id)
      return {
        badgeId: b.id,
        name: definition?.name ?? catalog?.name ?? b.id,
        description: definition?.description ?? catalog?.description ?? "",
        iconName: definition?.iconName ?? "award",
        rarity: b.rarity ?? definition?.rarity ?? "common",
        earnedAt: b.awardedAt,
        xpValue: catalog?.xpValue ?? 0,
      }
    })
    .sort((a, z) => new Date(z.earnedAt).getTime() - new Date(a.earnedAt).getTime())

  if (rarityFilter) {
    badges = badges.filter((b) => b.rarity === rarityFilter)
  }

  return NextResponse.json({ agentId, badges, total: badges.length })
}
