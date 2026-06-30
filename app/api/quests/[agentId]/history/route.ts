import { NextResponse } from "next/server"
import { readQuestProgress } from "@/lib/gamification/quest-persistence"
import { getQuestById, buildQuests, getMockQuestStats } from "@/lib/gamification/quests"
import { listStoredQuests } from "@/lib/gamification/quest-store"

type RouteContext = {
  params: Promise<{ agentId: string }>
}

export const dynamic = "force-dynamic"

export async function GET(req: Request, context: RouteContext) {
  const { agentId } = await context.params
  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10))
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get("pageSize") || "30", 10)))

  const store = readQuestProgress()
  const agentCompletions = store.completions
    .filter(c => c.actorId === agentId)
    .sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime())

  const total = agentCompletions.length
  const start = (page - 1) * pageSize
  const paginated = agentCompletions.slice(start, start + pageSize)

  // Hydrate with quest data
  const generatedQuests = buildQuests(getMockQuestStats())
  const storedQuests = listStoredQuests({ includeExpired: true })

  const hydrated = paginated.map(c => {
    // Check generated
    let quest = generatedQuests.find(q => q.id === c.questId)
    if (!quest) {
      // Check stored
      const stored = storedQuests.find(q => q.id === c.questId)
      if (stored) {
        quest = {
          id: stored.id,
          type: stored.type,
          title: stored.title,
          description: stored.description,
          reward: stored.reward,
          progress: stored.progress,
          unlocksQuestId: stored.unlocksQuestId,
          minReputation: stored.minReputation,
          completedAt: stored.completedAt,
          expiresAt: stored.expiresAt ?? undefined,
          subTasks: stored.subTasks,
          status: stored.status,
        }
      }
    }
    
    return {
      ...c,
      quest: quest || null
    }
  })

  return NextResponse.json({
    ok: true,
    history: hydrated,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  })
}
