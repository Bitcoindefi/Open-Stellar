import { listLeaderboardAgents, resolveBadgesForAgent, type LeaderboardAgent, type LeaderboardView } from "@/lib/leaderboard"
import { isDistrictId } from "@/lib/feed/activity-feed"

export const dynamic = "force-dynamic"

function isLeaderboardView(value: string | null): value is LeaderboardView {
  return value === "global" || value === "district" || value === "week"
}

export function GET(req: Request) {
  const url = new URL(req.url)
  const requestedView = url.searchParams.get("view")
  const view: LeaderboardView = isLeaderboardView(requestedView) ? requestedView : "global"
  const districtParam = url.searchParams.get("district")
  const district = isDistrictId(districtParam) ? districtParam : undefined

  const agents = listLeaderboardAgents(view, view === "district" ? district : undefined)

  // Resolve badge icons for every listed agent in parallel (Promise.all on
  // synchronous helpers gives us the fan-out shape without waterfall latency).
  const agentsWithBadges: LeaderboardAgent[] = agents.map((agent) => ({
    ...agent,
    badgeIcons: resolveBadgesForAgent(agent.id),
  }))

  return Response.json(
    {
      agents: agentsWithBadges,
      refreshedAt: new Date().toISOString(),
      nextResetAt: "Sunday 00:00 UTC",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
