import { enrichBadges, listLeaderboardAgents, type LeaderboardView } from "@/lib/leaderboard"
import { isDistrictId } from "@/lib/feed/activity-feed"

export const dynamic = "force-dynamic"

function isLeaderboardView(value: string | null): value is LeaderboardView {
  return value === "global" || value === "district" || value === "week"
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const requestedView = url.searchParams.get("view")
  const view: LeaderboardView = isLeaderboardView(requestedView) ? requestedView : "global"
  const districtParam = url.searchParams.get("district")
  const district = isDistrictId(districtParam) ? districtParam : undefined
  const agents = listLeaderboardAgents(view, view === "district" ? district : undefined)

  const badgeEntries = await Promise.all(
    agents.map(async (agent) => [agent.id, enrichBadges(agent.id)] as const)
  )
  const badgesById = Object.fromEntries(badgeEntries)

  const enrichedAgents = agents.map((agent) => ({
    ...agent,
    badges: badgesById[agent.id] ?? [],
  }))

  return Response.json(
    {
      agents: enrichedAgents,
      refreshedAt: new Date().toISOString(),
      nextResetAt: "Sunday 00:00 UTC",
    },
    { headers: { "Cache-Control": "public, max-age=30" } },
  )
}
