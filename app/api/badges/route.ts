import { NextResponse } from "next/server"

import { getBadgeEarnedByCounts, listBadgeCatalog } from "@/lib/agents/badges"

export async function GET() {
  const counts = getBadgeEarnedByCounts()

  return NextResponse.json(
    listBadgeCatalog().map((badge) => ({
      ...badge,
      earnedByCount: counts[badge.type],
    })),
  )
}
