import type { AccessoryId, AgentAppearance, MoltbotAgent, SkinId } from "./types"
import { getAgentCardStats } from "./og-card-data"

export interface SkinDef {
  id: SkinId
  name: string
  levelRequired: number
  description: string
}

export const SKINS: SkinDef[] = [
  { id: "default", name: "Default", levelRequired: 1, description: "Standard robot sprite" },
  { id: "neon", name: "Neon", levelRequired: 10, description: "Color outline matching district color" },
  { id: "chrome", name: "Chrome", levelRequired: 20, description: "Metallic sheen overlay" },
  { id: "hologram", name: "Hologram", levelRequired: 30, description: "Semi-transparent with scanline effect" },
  { id: "gold", name: "Gold", levelRequired: 40, description: "Gold tint + sparkle frame" },
  { id: "legendary", name: "Legendary", levelRequired: 50, description: "Animated aura + particle trail" },
]

export interface BadgeDef {
  id: string
  name: string
  description: string
  isUnlocked: (agent: MoltbotAgent, allAgents: MoltbotAgent[]) => boolean
}

export const BADGES: BadgeDef[] = [
  {
    id: "district-legend",
    name: "District Legend",
    description: "Most tasks completed of any agent in your district",
    isUnlocked: (agent, allAgents) => {
      const peers = allAgents.filter((a) => a.district === agent.district)
      if (peers.length === 0) return false
      const max = Math.max(...peers.map((a) => a.tasksCompleted))
      return agent.tasksCompleted > 0 && agent.tasksCompleted === max
    },
  },
  {
    id: "speed-demon",
    name: "Speed Demon",
    description: "Reached max level in a skill",
    isUnlocked: (agent) => agent.skills.some((s) => s.level >= s.maxLevel),
  },
  {
    id: "ironclad",
    name: "Ironclad",
    description: "Auto-restart enabled with zero downtime",
    isUnlocked: (agent) => Boolean(agent.autoRestart) && agent.status !== "offline" && agent.status !== "error",
  },
  {
    id: "thousand-tasks",
    name: "1000 Tasks",
    description: "Completed 1000 tasks",
    isUnlocked: (agent) => agent.tasksCompleted >= 1000,
  },
  {
    id: "zk-certified",
    name: "ZK Certified",
    description: "Wallet funded and verified on Stellar testnet",
    isUnlocked: (agent) => Boolean(agent.wallet?.funded),
  },
]

export interface AccessoryDef {
  id: AccessoryId
  name: string
  emoji: string
  badgeId: string
}

export const ACCESSORIES: AccessoryDef[] = [
  { id: "crown", name: "Crown", emoji: "\u{1F451}", badgeId: "district-legend" },
  { id: "lightning", name: "Lightning Bolt", emoji: "⚡", badgeId: "speed-demon" },
  { id: "shield", name: "Shield", emoji: "\u{1F6E1}️", badgeId: "ironclad" },
  { id: "diamond", name: "Diamond", emoji: "\u{1F48E}", badgeId: "thousand-tasks" },
  { id: "zk-lock", name: "ZK Lock", emoji: "\u{1F510}", badgeId: "zk-certified" },
]

export const COLOR_CHANGE_COST_XLM = "0.5"

export function defaultAppearance(): AgentAppearance {
  return { skin: "default", accessories: [], customColor: null }
}

export function getAgentLevel(agent: MoltbotAgent): number {
  return getAgentCardStats(agent).level
}

export function getUnlockedBadgeIds(agent: MoltbotAgent, allAgents: MoltbotAgent[]): string[] {
  return BADGES.filter((badge) => badge.isUnlocked(agent, allAgents)).map((badge) => badge.id)
}

export function getUnlockedSkinIds(agent: MoltbotAgent): SkinId[] {
  const level = getAgentLevel(agent)
  return SKINS.filter((skin) => level >= skin.levelRequired).map((skin) => skin.id)
}

export function getUnlockedAccessoryIds(agent: MoltbotAgent, allAgents: MoltbotAgent[]): AccessoryId[] {
  const badgeIds = new Set(getUnlockedBadgeIds(agent, allAgents))
  return ACCESSORIES.filter((accessory) => badgeIds.has(accessory.badgeId)).map((accessory) => accessory.id)
}

export function isSkinUnlockedForLevel(skinId: SkinId, level: number): boolean {
  const skin = SKINS.find((s) => s.id === skinId)
  return Boolean(skin && level >= skin.levelRequired)
}

export function isAccessoryUnlockedForBadges(accessoryId: AccessoryId, badgeIds: string[]): boolean {
  const accessory = ACCESSORIES.find((a) => a.id === accessoryId)
  return Boolean(accessory && badgeIds.includes(accessory.badgeId))
}
