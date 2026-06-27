import type { MoltbotAgent, District, DistrictId, Skill, ChatMessage } from "./types"
import { getSkillUpgradeCost } from "./gamification/skill-upgrades"
import { getXpToNextLevel } from "./gamification/xp"

export const DISTRICTS: District[] = [
  { id: "data-center", name: "Data Center", color: "#22d3ee", bgColor: "#0e2a30", x: 40, y: 60, w: 260, h: 200 },
  { id: "comm-hub", name: "Comm Hub", color: "#34d399", bgColor: "#0e2a1e", x: 320, y: 60, w: 260, h: 200 },
  { id: "processing", name: "Processing", color: "#fbbf24", bgColor: "#2a2510", x: 600, y: 60, w: 260, h: 200 },
  { id: "defense", name: "Defense Grid", color: "#f87171", bgColor: "#2a1414", x: 120, y: 290, w: 300, h: 200 },
  { id: "research", name: "Research Lab", color: "#a78bfa", bgColor: "#1e142a", x: 460, y: 290, w: 300, h: 200 },
]

const NAMES = [
  "Nexus-7", "Cipher-3", "Pulse-9", "Vector-1", "Halo-5",
  "Stratos-2", "Bolt-8", "Prism-4", "Flux-6", "Nova-0",
  "Vertex-11", "Echo-12",
]

const MODELS = ["claude-4-sonnet", "claude-4-opus", "claude-3.5-haiku", "gpt-5-mini"]

export const SPRITE_COUNT = 7

const TASKS: Record<DistrictId, string[]> = {
  "data-center": ["Indexing datasets", "Running backup", "Syncing replicas", "Compressing logs"],
  "comm-hub": ["Routing messages", "Encrypting channel", "Relaying signals", "Handshake protocol"],
  "processing": ["Batch inference", "Tokenizing input", "Gradient descent", "Model fine-tune"],
  "defense": ["Scanning perimeter", "Firewall update", "Threat analysis", "Anomaly detection"],
  "research": ["Hypothesis test", "Paper analysis", "Experiment run", "Data visualization"],
}

// -------- Skills System --------

const SKILL_POOL: Record<DistrictId, string[]> = {
  "data-center": ["Data Mining", "Backup Ops", "Index Optimization", "Log Analysis", "Cache Tuning"],
  "comm-hub": ["Encryption", "Signal Routing", "Protocol Design", "Relay Management", "Packet Analysis"],
  processing: ["ML Training", "Tokenization", "Batch Processing", "Model Tuning", "Pipeline Ops"],
  defense: ["Firewall Mgmt", "Threat Detection", "Anomaly Scan", "Perimeter Guard", "Intrusion Block"],
  research: ["Hypothesis Testing", "Data Viz", "Paper Analysis", "Experiment Design", "Stats Modeling"],
}

function rand(min: number, max: number, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function generateSkills(district: DistrictId, random = Math.random): Skill[] {
  const pool = SKILL_POOL[district]
  const count = rand(2, 4, random)
  const shuffled = [...pool].sort(() => random() - 0.5)
  return shuffled.slice(0, count).map((name, i) => {
    const level = rand(1, 4, random)
    const maxLevel = 5
    const xpToNext = getSkillUpgradeCost({ level, maxLevel }) ?? 0

    return {
      id: `${district}-skill-${i}`,
      name,
      level,
      maxLevel,
      xp: rand(0, Math.max(80, xpToNext + 40), random),
      xpToNext,
    }
  })
}

// -------- Chat System --------

const CHAT_TEMPLATES: Record<string, string[]> = {
  working: [
    "Processing batch #{n}... looking good",
    "Need more compute for this one",
    "Almost done, {pct}% through this task",
    "Running diagnostics on subsystem {n}",
    "Data stream stable, throughput optimal",
  ],
  cross_district: [
    "Hey @{to}, can you relay this dataset?",
    "@{to}, sending findings from {fromDist}",
    "Requesting backup from @{to} in {toDist}",
    "@{to}, need your analysis on this anomaly",
    "Syncing results with @{to}",
  ],
  idle: [
    "Standing by... awaiting instructions",
    "All clear in {dist}. Monitoring...",
    "Systems nominal. Anyone need help?",
    "Idle cycles... running self-diagnostics",
  ],
  error: [
    "WARNING: Circuit overload in sector {n}!",
    "Mayday! Rebooting subsystem...",
    "Memory leak detected -- patching now",
    "Critical error! Failover initiated",
  ],
  social: [
    "@{to}, nice work on that last batch!",
    "Stellar balance looking healthy today",
    "Who wants to run a joint analysis?",
    "@{to}, transfer confirmed. Thanks!",
    "New skill unlocked! Leveling up {skill}",
  ],
}

let chatIdCounter = 0

export function generateChatMessage(agents: MoltbotAgent[]): ChatMessage | null {
  if (agents.length < 2) return null

  const from = agents[rand(0, agents.length - 1)]
  let to = agents[rand(0, agents.length - 1)]
  while (to.id === from.id) {
    to = agents[rand(0, agents.length - 1)]
  }

  let category: string
  if (from.status === "error") category = "error"
  else if (from.status === "idle") category = "idle"
  else if (from.district !== to.district) category = "cross_district"
  else if (Math.random() < 0.3) category = "social"
  else category = "working"

  const templates = CHAT_TEMPLATES[category]
  let msg = templates[rand(0, templates.length - 1)]

  const fromDist = DISTRICTS.find(d => d.id === from.district)?.name || from.district
  const toDist = DISTRICTS.find(d => d.id === to.district)?.name || to.district
  const skillName = from.skills.length > 0 ? from.skills[rand(0, from.skills.length - 1)].name : "Data Ops"

  msg = msg
    .replace("{to}", to.name)
    .replace("{from}", from.name)
    .replace("{fromDist}", fromDist)
    .replace("{toDist}", toDist)
    .replace("{dist}", fromDist)
    .replace("{skill}", skillName)
    .replace("{n}", String(rand(1, 99)))
    .replace("{pct}", String(rand(40, 95)))

  chatIdCounter++
  const now = new Date()
  return {
    id: chatIdCounter,
    fromAgentId: from.id,
    fromName: from.name,
    toName: to.name,
    message: msg,
    timestamp: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    fromColor: from.color,
  }
}

// -------- Agent Factory --------

export function createAgents(): MoltbotAgent[] {
  const random = createSeededRandom(0x051e11a9)
  const colors = ["#22d3ee", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#60a5fa", "#fb923c", "#e879f9", "#2dd4bf", "#facc15", "#818cf8", "#f472b6"]
  return NAMES.map((name, i) => {
    const districtIdx = i % DISTRICTS.length
    const district = DISTRICTS[districtIdx]
    const px = district.x + rand(30, district.w - 50, random)
    const py = district.y + rand(40, district.h - 40, random)
    return {
      id: `bot-${i}`,
      name,
      model: MODELS[i % MODELS.length],
      xp: rand(0, 90, random),
      level: 1,
      xpToNext: getXpToNextLevel(1),
      status: (["active", "working", "idle", "working", "active"] as const)[i % 5],
      district: district.id,
      cpu: rand(20, 95, random),
      memory: rand(30, 85, random),
      tasksCompleted: rand(10, 200, random),
      currentTask: TASKS[district.id][rand(0, 3, random)],
      taskProgress: random() * 100,
      color: colors[i % colors.length],
      pixelX: px,
      pixelY: py,
      targetX: px,
      targetY: py,
      frame: 0,
      direction: "right" as const,
      spriteId: i % SPRITE_COUNT,
      skills: generateSkills(district.id, random),
      autoRestart: i % 3 === 0,
      appearance: { skin: "default", accessories: [], customColor: null },
    }
  })
}

export function getRandomTask(districtId: DistrictId): string {
  const tasks = TASKS[districtId]
  return tasks[rand(0, tasks.length - 1)]
}
