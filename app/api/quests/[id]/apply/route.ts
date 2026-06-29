import { NextResponse } from "next/server"

import { getQuestById } from "@/lib/gamification/quests"
import { getReputationByActorId } from "@/lib/reputation/reputation-store"
import { isAuthorized } from "@/lib/auth"
import { hasClaimedQuest, markQuestClaimed } from "@/lib/gamification/quest-completions"

type QuestApplyContext = {
  params: Promise<{ id: string }>
}

interface QuestApplyBody {
  actorId?: unknown
}

async function readApplyBody(req: Request): Promise<QuestApplyBody> {
  try {
    const body = await req.json()
    return typeof body === "object" && body !== null ? body as QuestApplyBody : {}
  } catch {
    return {}
  }
}

export async function POST(req: Request, context: QuestApplyContext) {
  // Reward-bearing endpoint: only the trusted gateway may complete quests on an
  // agent's behalf. Without this, anyone could POST to mint rewards for any actorId.
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const quest = getQuestById(decodeURIComponent(id))

  if (!quest) {
    return NextResponse.json({ ok: false, error: "Quest not found" }, { status: 404 })
  }

  // Proof of completion: every sub-task must be done before the quest can be claimed.
  if (quest.subTasks && quest.subTasks.length > 0 && quest.subTasks.some((st) => st.status !== "done")) {
    return NextResponse.json(
      { ok: false, error: "Cannot complete quest with pending sub-tasks" },
      { status: 400 }
    )
  }

  const body = await readApplyBody(req)
  const actorId = typeof body.actorId === "string" ? body.actorId.trim() : ""

  // Bind the reward to a concrete actor; reject anonymous/empty claims.
  if (actorId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "actorId is required" },
      { status: 400 },
    )
  }

  const reputation = getReputationByActorId(actorId)

  if (quest.minReputation !== undefined && reputation.score < quest.minReputation) {
    return NextResponse.json(
      {
        ok: false,
        reason: "InsufficientReputation",
        required: quest.minReputation,
        current: reputation.score,
      },
      { status: 403 },
    )
  }

  // Idempotency: a given actor may claim a quest's reward only once. Replays are
  // acknowledged but do not re-trigger any reward (prevents repeated XP minting).
  if (hasClaimedQuest(quest.id, actorId)) {
    return NextResponse.json({ ok: true, alreadyClaimed: true, quest, actorId })
  }

  markQuestClaimed(quest.id, actorId)

  return NextResponse.json({ ok: true, quest, actorId })
}
