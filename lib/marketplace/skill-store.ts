export interface Skill {
  id: string
  agentId: string
  name: string // e.g. 'pdf-to-text', 'soroban-deploy'
  description: string
  priceXLM: number // micro-payment price per invocation
  callUrl: string // URL to invoke the skill (x402-enabled endpoint)
  active: boolean
  createdAt: number
}

export interface RegisterSkillInput {
  agentId: string
  name: string
  description: string
  priceXLM: number
  callUrl: string
}

export interface ListSkillsQuery {
  name?: string
  maxPriceXLM?: number
  agentId?: string
}

type SkillStoreDb = Map<string, Skill>

const globalStore = globalThis as typeof globalThis & {
  __openStellarSkillStoreDb__?: SkillStoreDb
}

const db: SkillStoreDb = globalStore.__openStellarSkillStoreDb__ ?? new Map()
if (!globalStore.__openStellarSkillStoreDb__) {
  globalStore.__openStellarSkillStoreDb__ = db
}

export function registerSkill(input: RegisterSkillInput): Skill {
  const agentId = input.agentId?.trim()
  if (!agentId) {
    throw new Error("agentId is required")
  }

  const name = input.name?.trim()
  if (!name) {
    throw new Error("name is required")
  }

  const description = (input.description ?? "").trim()

  const priceXLM = Number(input.priceXLM)
  if (!Number.isFinite(priceXLM) || priceXLM <= 0 || priceXLM > 100) {
    throw new Error("priceXLM must be > 0 and <= 100 XLM")
  }

  const callUrl = input.callUrl?.trim()
  if (!callUrl) {
    throw new Error("callUrl is required")
  }

  try {
    const url = new URL(callUrl)
    if (url.protocol !== "https:") {
      throw new Error("callUrl must be HTTPS")
    }
  } catch (err) {
    if (err instanceof Error && err.message === "callUrl must be HTTPS") {
      throw err
    }
    throw new Error("callUrl must be a valid URL")
  }

  // Count active skills for agent
  let agentSkillCount = 0
  for (const skill of db.values()) {
    if (skill.agentId === agentId && skill.active) {
      agentSkillCount++
    }
  }

  if (agentSkillCount >= 20) {
    const err = new Error("Agent has reached maximum limit of 20 active skills")
    ;(err as unknown as { statusCode: number }).statusCode = 429
    throw err
  }

  const id = `skill_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const skill: Skill = {
    id,
    agentId,
    name,
    description,
    priceXLM,
    callUrl,
    active: true,
    createdAt: Date.now(),
  }

  db.set(id, skill)
  return skill
}

export function listSkills(query: ListSkillsQuery = {}): Skill[] {
  const skills: Skill[] = []
  const filterName = query.name?.trim().toLowerCase()
  const filterAgentId = query.agentId?.trim()
  const filterMaxPrice = query.maxPriceXLM !== undefined && query.maxPriceXLM !== null && !isNaN(Number(query.maxPriceXLM))
    ? Number(query.maxPriceXLM)
    : undefined

  for (const skill of db.values()) {
    if (!skill.active) continue

    if (filterName && !skill.name.toLowerCase().includes(filterName)) {
      continue
    }

    if (filterAgentId && skill.agentId !== filterAgentId) {
      continue
    }

    if (filterMaxPrice !== undefined && skill.priceXLM > filterMaxPrice) {
      continue
    }

    skills.push(skill)
  }

  return skills.sort((a, b) => b.createdAt - a.createdAt)
}

export function getSkill(skillId: string): Skill | null {
  const skill = db.get(skillId)
  return skill ?? null
}

export function deactivateSkill(skillId: string, agentId: string): boolean {
  const skill = db.get(skillId)
  if (!skill) {
    return false
  }

  if (skill.agentId !== agentId) {
    const err = new Error("Unauthorized to deactivate this skill")
    ;(err as unknown as { statusCode: number }).statusCode = 403
    throw err
  }

  skill.active = false
  db.set(skillId, skill)
  return true
}

export function resetSkillStore() {
  db.clear()
}
