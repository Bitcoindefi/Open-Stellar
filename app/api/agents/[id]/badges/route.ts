import { NextResponse } from "next/server"
import { getRegisteredAgent } from "@/lib/agent-registry"
import { getReputation } from "@/lib/reputation/reputation-store"
import { getBadgeCatalogEntry, BADGE_RARITY_VALUES, type BadgeRarity } from "@/lib/gamification/badge-catalog"

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
  let badges = (metrics.badges ?? [])
    .map((b) => {
      const catalog = getBadgeCatalogEntry(b.id)
      return {
        badgeId: b.id,
        name: catalog?.name ?? b.id,
        description: catalog?.description ?? "",
        rarity: b.rarity as BadgeRarity,
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
