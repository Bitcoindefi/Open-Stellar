import { NextResponse } from "next/server"
import { getRegisteredAgent, updateAgentCapabilities } from "@/lib/agent-registry"
import { getReputation } from "@/lib/reputation/reputation-store"
import { getAgentQuestStats } from "@/lib/gamification/quest-leaderboard"

export const revalidate = 30

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  const agent = getRegisteredAgent(agentId)
  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  const reputation = getReputation(agentId)
  const stats = getAgentQuestStats(agentId)

  // Map capabilities to skills with actual registered versions
  const skillVersions = agent.skillVersions ?? []
  const skills = agent.capabilities.map((cap) => {
    const skillVersion = skillVersions.find((sv) => sv.id === cap)
    return {
      id: cap,
      version: skillVersion?.version ?? "1.0.0",
    }
  })

  return NextResponse.json({
    agentId,
    skills,
    districts: [{ districtId: agent.district, unlockedAt: agent.registeredAt }],
    badges: (reputation.metrics?.badges ?? []).map((b: { id: string; awardedAt: string }) => ({ id: b.id, awardedAt: b.awardedAt })),
    xp: stats.xpFromQuests,
    questsCompleted: stats.questsCompleted,
  })
}

export async function PUT(req: Request, context: RouteContext) {
  const { id } = await context.params

  try {
    const agent = updateAgentCapabilities(decodeURIComponent(id), await req.json())
    return NextResponse.json(
      { ok: true, agent },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed updating capabilities"
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "agent not found" ? 404 : 400 },
    )
  }
}