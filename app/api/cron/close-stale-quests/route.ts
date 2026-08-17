import { NextResponse } from "next/server"
import { runStaleQuestCheck } from "@/lib/quests/quest-store"
import { publishSystemEvent } from "@/lib/events/system-events"

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request" }, { status: 401 })
  }

  const result = runStaleQuestCheck()

  for (const quest of result.abandoned) {
    publishSystemEvent({ type: "quest.abandoned", questId: quest.id, quest })
  }

  for (const quest of result.expired) {
    publishSystemEvent({ type: "quest.expired", questId: quest.id, quest })
  }

  return NextResponse.json(
    {
      ok: true,
      checkedAt: result.checkedAt,
      checkedQuests: result.checkedQuests,
      abandoned: result.abandoned,
      expired: result.expired,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
