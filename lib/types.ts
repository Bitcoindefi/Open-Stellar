export type AgentStatus = "active" | "idle" | "running" | "working" | "error" | "offline" | "stopped"

export type DistrictId = "data-center" | "comm-hub" | "processing" | "defense" | "research"

export type SkinId = "default" | "neon" | "chrome" | "hologram" | "gold" | "legendary"

export type AccessoryId = "crown" | "lightning" | "shield" | "diamond" | "zk-lock"

export interface AgentAppearance {
  skin: SkinId
  accessories: AccessoryId[]
  customColor: string | null
}

export interface Skill {
  id: string
  name: string
  level: number
  maxLevel: number
  xp: number
  xpToNext: number
}

export interface StellarWallet {
  publicKey: string
  balance: string
  funded: boolean
}

export interface ChatMessage {
  id: number
  fromAgentId: string
  fromName: string
  toName: string
  message: string
  timestamp: string
  fromColor: string
}

export interface WalletTransaction {
  id: number
  fromName: string
  toName: string
  amount: string
  timestamp: string
  hash: string
}

export interface MoltbotAgent {
  id: string
  name: string
  model: string
  deployment?: "local" | "cloud"
  xp?: number
  level?: number
  xpToNext?: number
  status: AgentStatus
  district: DistrictId
  cpu: number
  memory: number
  tasksCompleted: number
  currentTask: string | null
  taskProgress: number
  color: string
  pixelX: number
  pixelY: number
  targetX: number
  targetY: number
  frame: number
  direction: "left" | "right"
  spriteId: number
  skills: Skill[]
  autoRestart?: boolean
  lastHeartbeat?: string
  offlineForSeconds?: number
  wallet?: StellarWallet
  appearance: AgentAppearance
}

export interface District {
  id: DistrictId
  name: string
  color: string
  bgColor: string
  x: number
  y: number
  w: number
  h: number
}

export interface LogEntry {
  id: number
  time: string
  agent: string
  message: string
  type: "info" | "success" | "error" | "warning"
}

export interface AgentTask {
  id: string
  agentId: string
  type: string
  payload: unknown
  status: "pending" | "running" | "completed" | "failed"
  createdAt: number
  startedAt?: number
  completedAt?: number
}
