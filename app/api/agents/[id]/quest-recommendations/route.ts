import { NextResponse } from "next/server"
import { getQuests } from "@/lib/gamification/quests"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  
  // Return up to 5 recommended (in progress) quests
  const quests = getQuests()
    .filter(q => q.status === "in_progress")
    .slice(0, 5)

  return NextResponse.json(
    { ok: true, quests, agentId: decodeURIComponent(id) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
