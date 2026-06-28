import { NextResponse } from "next/server"
import { listQuestSubtasks, questExists } from "@/lib/quests"
import { hasCycle } from "@/lib/graph"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const questId = decodeURIComponent(id)

  if (!questExists(questId)) {
    return NextResponse.json({ ok: false, error: "Quest not found", questId }, { status: 404 })
  }

  const subtasks = listQuestSubtasks(questId) ?? []

  const nodes = subtasks.map((s) => ({ id: s.id, title: s.title, status: s.status }))

  const edges: { from: string; to: string }[] = []
  const adj: Record<string, string[]> = {}

  // Build adjacency list where edge A -> B means A is a dependency of B
  for (const s of subtasks) {
    adj[s.id] = adj[s.id] ?? []
  }

  for (const s of subtasks) {
    const deps = s.dependsOn ?? []
    for (const dep of deps) {
      edges.push({ from: dep, to: s.id })
      adj[dep] = adj[dep] ?? []
      adj[dep].push(s.id)
    }
  }

  const cycle = hasCycle(adj)

  return NextResponse.json({ questId, nodes, edges, hasCycle: cycle })
}
