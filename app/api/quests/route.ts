import { NextResponse } from "next/server"

import { getQuests, getMockQuestStats, buildQuests } from "@/lib/gamification/quests"
import { listStoredQuests, createQuest, type StoredQuest } from "@/lib/gamification/quest-store"
import { isMockMode } from "@/lib/mock/mock-mode"

export const dynamic = "force-dynamic"

function storedToQuest(q: StoredQuest) {
  return {
    id: q.id,
    type: q.type,
    title: q.title,
    description: q.description,
    reward: q.reward,
    progress: q.progress,
    unlocksQuestId: q.unlocksQuestId,
    minReputation: q.minReputation,
    completedAt: q.completedAt,
    expiresAt: q.expiresAt ?? undefined,
    subTasks: q.subTasks,
    status: q.status,
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const includeExpired = url.searchParams.get("include_expired") === "true"

  // Merge generated quests with stored custom quests
  const generated = isMockMode() ? getQuests() : buildQuests(getMockQuestStats())
  const stored = listStoredQuests({ includeExpired })

  const storedMap = new Map(stored.map((q) => [q.id, storedToQuest(q)]))
  const merged = generated.map((q) => storedMap.get(q.id) ?? q)

  // Add stored quests that don't exist in generated definitions
  for (const q of stored) {
    if (!generated.find((g) => g.id === q.id)) {
      merged.push(storedToQuest(q))
    }
  }

  // Filter out expired unless explicitly requested
  const quests = includeExpired ? merged : merged.filter((q) => q.status !== "expired")

  return NextResponse.json({ ok: true, quests })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const type = String(body.type || "daily")
    const title = String(body.title || "")
    const description = String(body.description || "")
    const reward = body.reward ?? { xp: 0 }
    const expiresAt = body.expiresAt ? String(body.expiresAt) : null
    const unlocksQuestId = typeof body.unlocksQuestId === "string" && body.unlocksQuestId.trim()
      ? body.unlocksQuestId.trim()
      : undefined
    const minReputation = body.minReputation !== undefined ? Number(body.minReputation) : undefined
    const assignedAgentIds = Array.isArray(body.assignedAgentIds)
      ? body.assignedAgentIds.map(String)
      : []

    if (!id || !title) {
      return NextResponse.json(
        { ok: false, error: "id and title are required" },
        { status: 400 },
      )
    }

    const quest = createQuest({
      id,
      type: type as "daily" | "weekly" | "story",
      title,
      description,
      reward,
      expiresAt,
      unlocksQuestId,
      minReputation,
      assignedAgentIds,
    })

    return NextResponse.json({ ok: true, quest: storedToQuest(quest) })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed creating quest" },
      { status: 500 },
    )
  }
}
