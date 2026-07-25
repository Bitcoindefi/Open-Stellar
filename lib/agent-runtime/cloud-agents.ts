import type { DistrictId, MoltbotAgent } from "@/lib/types"
import { DISTRICTS, SPRITE_COUNT } from "@/lib/data"
import { publishSystemEvent } from "@/lib/events/system-events"
import { recordAgentHeartbeat } from "@/lib/agents/agent-health-store"
import { getAgentHealthSummary, recordAgentExecutionSuccess } from "@/lib/agents/agent-error-store"

export type CloudAgentConfig = {
  id: string
  name: string
  model: string
  district: DistrictId
  endpointUrl: string
  queueMode: "post" | "sse"
  createdAt: string
  lastTaskAt: string | null
  lastResult: string | null
}

const globalCloud = globalThis as typeof globalThis & { __openStellarCloudAgents__?: Map<string, CloudAgentConfig> }
const configs = globalCloud.__openStellarCloudAgents__ ?? new Map<string, CloudAgentConfig>()
if (!globalCloud.__openStellarCloudAgents__) globalCloud.__openStellarCloudAgents__ = configs

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)
}

function appUrl(req?: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  if (envUrl) return envUrl
  if (req) {
    const url = new URL(req.url)
    return `${url.protocol}//${url.host}`
  }
  return "http://localhost:3000"
}

export function provisionCloudAgent(input: { name?: string; model?: string; district?: DistrictId; queueMode?: "post" | "sse" }, req?: Request): CloudAgentConfig {
  const district = DISTRICTS.some((d) => d.id === input.district) ? input.district! : "research"
  const name = (input.name || `Cloud-${configs.size + 1}`).trim().slice(0, 40)
  const idBase = slugify(name) || "cloud-agent"
  let id = idBase.startsWith("cloud-") ? idBase : `cloud-${idBase}`
  let suffix = 2
  while (configs.has(id)) id = `${idBase}-${suffix++}`

  const config: CloudAgentConfig = {
    id,
    name,
    model: (input.model || "claude-4-sonnet").trim().slice(0, 80),
    district,
    endpointUrl: `${appUrl(req)}/agents/${encodeURIComponent(id)}`,
    queueMode: input.queueMode || "post",
    createdAt: new Date().toISOString(),
    lastTaskAt: null,
    lastResult: null,
  }
  configs.set(id, config)
  recordAgentHeartbeat(id, { status: "active", cpu: 5, memory: 18, currentTask: "Waiting for cloud tasks", autoRestart: true })
  publishSystemEvent({ type: "agent.status", agentId: id, status: "active" })
  return config
}

export function listCloudAgentConfigs(): CloudAgentConfig[] {
  return Array.from(configs.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getCloudAgentConfig(id: string): CloudAgentConfig | null {
  return configs.get(id) ?? null
}

export function updateCloudAgentResult(id: string, summary: string): CloudAgentConfig | null {
  const config = configs.get(id)
  if (!config) return null
  recordAgentExecutionSuccess(id)
  const updated = { ...config, lastTaskAt: new Date().toISOString(), lastResult: summary.slice(0, 240) }
  configs.set(id, updated)
  return updated
}

export function cloudConfigToAgent(config: CloudAgentConfig, index = 0): MoltbotAgent {
  const district = DISTRICTS.find((d) => d.id === config.district) ?? DISTRICTS[0]
  const x = district.x + 42 + (index * 34) % Math.max(80, district.w - 80)
  const y = district.y + 58 + (index * 29) % Math.max(80, district.h - 80)
  const health = getAgentHealthSummary(config.id)
  return {
    id: config.id,
    name: config.name,
    model: config.model,
    deployment: "cloud",
    status: health.degraded ? "degraded" : "active",
    district: config.district,
    cpu: 5,
    memory: 18,
    tasksCompleted: config.lastTaskAt ? 1 : 0,
    currentTask: health.degraded ? `Degraded: ${health.errorCount24h} errors in 24h` : config.lastResult ?? "Waiting for cloud tasks",
    taskProgress: 0,
    color: "#38bdf8",
    pixelX: x,
    pixelY: y,
    targetX: x,
    targetY: y,
    frame: 0,
    direction: "right",
    spriteId: (index + 5) % SPRITE_COUNT,
    skills: [{ id: `${config.id}-edge`, name: "Edge Runtime", level: 1, maxLevel: 5, xp: 0, xpToNext: 100 }],
    autoRestart: true,
    lastHeartbeat: health.lastSeen ?? config.createdAt,
    offlineForSeconds: health.errorCount24h,
    appearance: { skin: "neon", accessories: [], customColor: null },
  }
}
