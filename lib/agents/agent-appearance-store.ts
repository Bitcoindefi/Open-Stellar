import type { AccessoryId, AgentAppearance, SkinId } from "@/lib/types"
import { defaultAppearance } from "@/lib/cosmetics"

type AppearanceDb = Map<string, AgentAppearance>

const globalAppearance = globalThis as typeof globalThis & {
  __openStellarAppearanceDb__?: AppearanceDb
}

const db: AppearanceDb = globalAppearance.__openStellarAppearanceDb__ ?? new Map()
if (!globalAppearance.__openStellarAppearanceDb__) {
  globalAppearance.__openStellarAppearanceDb__ = db
}

export function getAgentAppearance(agentId: string): AgentAppearance {
  const current = db.get(agentId)
  return current ? { ...current, accessories: [...current.accessories] } : defaultAppearance()
}

export function setAgentSkin(agentId: string, skin: SkinId): AgentAppearance {
  const next = { ...getAgentAppearance(agentId), skin }
  db.set(agentId, next)
  return next
}

export function setAgentAccessories(agentId: string, accessories: AccessoryId[]): AgentAppearance {
  const next = { ...getAgentAppearance(agentId), accessories }
  db.set(agentId, next)
  return next
}

export function setAgentCustomColor(agentId: string, color: string): AgentAppearance {
  const next = { ...getAgentAppearance(agentId), customColor: color }
  db.set(agentId, next)
  return next
}

export function resetAgentAppearanceStore() {
  db.clear()
}
