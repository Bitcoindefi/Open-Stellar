import { NextResponse } from "next/server"
import { listAgentHealth } from "@/lib/agents/agent-health-store"
import { listAgentUptimes, type AgentUptimeSnapshot } from "@/lib/agents/agent-uptime-store"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10
}

function calculateUptimePct(uptime: AgentUptimeSnapshot, checkedAtMs: number): number {
  const firstSeenMs = Date.parse(uptime.firstSeenAt)
  if (!Number.isFinite(firstSeenMs)) return 0

  const totalAgeDays = Math.max(1, Math.ceil((checkedAtMs - firstSeenMs) / DAY_MS))
  return clampPercentage((uptime.uptimeDays / totalAgeDays) * 100)
}

function percentile(sortedValues: number[], pct: number): number {
  if (sortedValues.length === 0) return 100

  const rank = Math.ceil((pct / 100) * sortedValues.length)
  const index = Math.max(0, Math.min(sortedValues.length - 1, rank - 1))
  return sortedValues[index]
}

export async function GET(_req: Request) {
  const checkedAtMs = Date.now()
  const checkedAt = new Date(checkedAtMs).toISOString()
  const health = listAgentHealth(checkedAtMs)

  if (health.length === 0) {
    return NextResponse.json(
      {
        totalAgents: 0,
        online: 0,
        offline: 0,
        averageUptimePct: 100,
        p50UptimePct: 100,
        p95UptimePct: 100,
        checkedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  const uptimesByAgent = new Map(listAgentUptimes(checkedAtMs).map((uptime) => [uptime.agentId, uptime]))
  const uptimePercentages = health.map((agent) => {
    const uptime = uptimesByAgent.get(agent.agentId)
    return uptime ? calculateUptimePct(uptime, checkedAtMs) : 0
  })
  const sortedPercentages = [...uptimePercentages].sort((a, b) => a - b)
  const totalUptimePct = uptimePercentages.reduce((sum, value) => sum + value, 0)
  const offline = health.filter((agent) => agent.status === "offline").length
  const online = health.length - offline

  return NextResponse.json(
    {
      totalAgents: health.length,
      online,
      offline,
      averageUptimePct: roundPercentage(totalUptimePct / health.length),
      p50UptimePct: roundPercentage(percentile(sortedPercentages, 50)),
      p95UptimePct: roundPercentage(percentile(sortedPercentages, 95)),
      checkedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
