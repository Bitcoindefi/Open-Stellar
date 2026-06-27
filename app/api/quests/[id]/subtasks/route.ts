import { NextResponse } from "next/server"

import { addSubTask, getQuestById } from "@/lib/gamification/quests"

type Context = {
  params: Promise<{ id: string }>
}

function sanitizeDependsOn(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .filter((dependency): dependency is string => typeof dependency === "string")
    .map((dependency) => dependency.trim())
    .filter((dependency) => dependency.length > 0)
}

export async function POST(req: Request, context: Context) {
  const { id } = await context.params
  const questId = decodeURIComponent(id)
  const quest = getQuestById(questId)

  if (!quest) {
    return NextResponse.json({ ok: false, error: "Quest not found" }, { status: 404 })
  }

  try {
    const body = await req.json()
    if (!body || typeof body !== "object" || typeof body.title !== "string" || body.title.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid title" }, { status: 400 })
    }

    const title = body.title.trim()
    const assignedAgentId = typeof body.assignedAgentId === "string" && body.assignedAgentId.trim().length > 0
      ? body.assignedAgentId.trim()
      : undefined
    const dependsOn = sanitizeDependsOn(body.dependsOn)

    const subTask = addSubTask(questId, title, assignedAgentId, dependsOn)
    return NextResponse.json({ ok: true, subTask }, { status: 201 })
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }
}
