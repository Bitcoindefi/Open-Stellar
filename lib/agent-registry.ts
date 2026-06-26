import { publishSystemEvent } from "@/lib/events/system-events"
import type { AgentStatus, DistrictId } from "@/lib/types"

export interface AgentX402Manifest {
  accepts: boolean
  pricePerTask?: string
}

export interface AgentCapabilityManifest {
  agentId: string
  model: string
  district: DistrictId
  capabilities: string[]
  x402: AgentX402Manifest
  status: AgentStatus
  endpoint: string
  registeredAt: string
  updatedAt: string
}

export interface AgentRegistryFilters {
  district?: string
  status?: string
  skill?: string
}

export type AgentRegistryChangeAction = "registered" | "updated" | "deregistered"

const DISTRICTS: DistrictId[] = ["data-center", "comm-hub", "processing", "defense", "research"]
const STATUSES: AgentStatus[] = ["active", "idle", "working", "error", "offline"]

interface AgentRegistryState {
  agents: Map<string, AgentCapabilityManifest>
}

const globalState = globalThis as typeof globalThis & {
  __openStellarAgentRegistry__?: AgentRegistryState
}

const registry: AgentRegistryState = globalState.__openStellarAgentRegistry__ ?? {
  agents: new Map<string, AgentCapabilityManifest>(),
}

if (!globalState.__openStellarAgentRegistry__) {
  globalState.__openStellarAgentRegistry__ = registry
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value.trim()
}

function normalizeDistrict(value: unknown): DistrictId {
  const district = normalizeString(value, "district")
  if (!DISTRICTS.includes(district as DistrictId)) {
    throw new Error(`district must be one of: ${DISTRICTS.join(", ")}`)
  }
  return district as DistrictId
}

function normalizeStatus(value: unknown): AgentStatus {
  const status = normalizeString(value, "status")
  if (!STATUSES.includes(status as AgentStatus)) {
    throw new Error(`status must be one of: ${STATUSES.join(", ")}`)
  }
  return status as AgentStatus
}

function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("capabilities must be an array")
  }

  const capabilities = value.map((capability, index) => normalizeString(capability, `capabilities[${index}]`))
  return Array.from(new Set(capabilities))
}

function normalizeX402(value: unknown): AgentX402Manifest {
  if (!isRecord(value)) {
    throw new Error("x402 must be an object")
  }

  if (typeof value.accepts !== "boolean") {
    throw new Error("x402.accepts must be a boolean")
  }

  return {
    accepts: value.accepts,
    pricePerTask: value.pricePerTask === undefined ? undefined : normalizeString(value.pricePerTask, "x402.pricePerTask"),
  }
}

function emitRegistryChange(action: AgentRegistryChangeAction, agent: AgentCapabilityManifest): void {
  publishSystemEvent({
    type: "agent.registry",
    action,
    agentId: agent.agentId,
    agent,
  })
}

export function listRegisteredAgents(filters: AgentRegistryFilters = {}): AgentCapabilityManifest[] {
  return Array.from(registry.agents.values()).filter((agent) => {
    if (filters.district && agent.district !== filters.district) return false
    if (filters.status && agent.status !== filters.status) return false
    if (filters.skill && !agent.capabilities.includes(filters.skill)) return false
    return true
  })
}

export function getRegisteredAgent(agentId: string): AgentCapabilityManifest | null {
  return registry.agents.get(agentId) ?? null
}

export function registerAgent(input: unknown): AgentCapabilityManifest {
  if (!isRecord(input)) {
    throw new Error("agent manifest must be an object")
  }

  const now = new Date().toISOString()
  const agent: AgentCapabilityManifest = {
    agentId: normalizeString(input.agentId, "agentId"),
    model: normalizeString(input.model, "model"),
    district: normalizeDistrict(input.district),
    capabilities: normalizeCapabilities(input.capabilities),
    x402: normalizeX402(input.x402),
    status: normalizeStatus(input.status),
    endpoint: normalizeString(input.endpoint, "endpoint"),
    registeredAt: now,
    updatedAt: now,
  }

  registry.agents.set(agent.agentId, agent)
  emitRegistryChange("registered", agent)
  return agent
}

export function updateAgentCapabilities(agentId: string, input: unknown): AgentCapabilityManifest {
  const existing = registry.agents.get(agentId)
  if (!existing) {
    throw new Error("agent not found")
  }

  if (!isRecord(input)) {
    throw new Error("capability update must be an object")
  }

  const updated: AgentCapabilityManifest = {
    ...existing,
    capabilities: normalizeCapabilities(input.capabilities),
    updatedAt: new Date().toISOString(),
  }

  registry.agents.set(agentId, updated)
  emitRegistryChange("updated", updated)
  return updated
}

export function deregisterAgent(agentId: string): AgentCapabilityManifest | null {
  const existing = registry.agents.get(agentId)
  if (!existing) return null

  registry.agents.delete(agentId)
  emitRegistryChange("deregistered", existing)
  return existing
}

export function resetAgentRegistryForTests(): void {
  registry.agents.clear()
}
