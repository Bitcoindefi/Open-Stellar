import { NextResponse } from "next/server"
import { BADGE_CATALOG, BADGE_RARITY_VALUES } from "@/lib/gamification/badge-catalog"
import { listReputations } from "@/lib/reputation/reputation-store"

export async function GET(req: Request) {
  const rarityFilter = new URL(req.url).searchParams.get("rarity")
  if (rarityFilter !== null && !(BADGE_RARITY_VALUES as readonly string[]).includes(rarityFilter)) {
    return NextResponse.json(
      { ok: false, error: `invalid rarity "${rarityFilter}"; must be one of: ${BADGE_RARITY_VALUES.join(", ")}` },
      { status: 400 },
    )
  }

  const counts = new Map<string, number>()
  for (const snapshot of listReputations(Number.MAX_SAFE_INTEGER)) {
    const seen = new Set<string>()
    for (const b of snapshot.metrics.badges ?? []) {
      if (!seen.has(b.id)) {
        seen.add(b.id)
        counts.set(b.id, (counts.get(b.id) ?? 0) + 1)
      }
    }
  }

  let catalog = BADGE_CATALOG
  if (rarityFilter) {
    catalog = catalog.filter((e) => e.rarity === rarityFilter)
  }

  return NextResponse.json(
    catalog.map((e) => ({ ...e, earnedByCount: counts.get(e.badgeId) ?? 0 })),
  )
}
