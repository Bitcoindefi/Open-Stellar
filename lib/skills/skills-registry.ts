import fs from 'node:fs'
import path from 'node:path'

export interface AgentSkill {
  skillId: string
  agentId: string
  name: string
  description: string
  priceXlm: number
  endpoint: string
  createdAt: string
  updatedAt: string
}

export interface SkillSearchFilters {
  q?: string
  maxPrice?: number
  agentId?: string
}

const SKILLS_DIR = path.join(process.cwd(), '.data', 'skills')

function ensureSkillsDir(): void {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true })
  }
}

function getSkillsFilePath(agentId: string): string {
  return path.join(SKILLS_DIR, `${agentId}.json`)
}

function loadAgentSkills(agentId: string): AgentSkill[] {
  const filePath = getSkillsFilePath(agentId)
  if (!fs.existsSync(filePath)) {
    return []
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(content)
    return Array.isArray(data.skills) ? data.skills : []
  } catch {
    return []
  }
}

function saveAgentSkills(agentId: string, skills: AgentSkill[]): void {
  ensureSkillsDir()
  const filePath = getSkillsFilePath(agentId)
  fs.writeFileSync(filePath, JSON.stringify({ skills }, null, 2), 'utf-8')
}

export function registerSkill(input: {
  skillId: string
  agentId: string
  name: string
  description: string
  priceXlm: number
  endpoint: string
}): AgentSkill {
  const { skillId, agentId, name, description, priceXlm, endpoint } = input

  if (!skillId?.trim()) throw new Error('skillId is required')
  if (!agentId?.trim()) throw new Error('agentId is required')
  if (!name?.trim()) throw new Error('name is required')
  if (!description?.trim()) throw new Error('description is required')
  if (!Number.isFinite(priceXlm) || priceXlm < 0) throw new Error('priceXlm must be >= 0')
  if (!endpoint?.trim()) throw new Error('endpoint is required')

  const skills = loadAgentSkills(agentId)
  const existing = skills.find((s) => s.skillId === skillId)

  if (existing) {
    throw new Error(`Skill ${skillId} already exists for agent ${agentId}`)
  }

  const now = new Date().toISOString()
  const skill: AgentSkill = {
    skillId: skillId.trim(),
    agentId: agentId.trim(),
    name: name.trim(),
    description: description.trim(),
    priceXlm,
    endpoint: endpoint.trim(),
    createdAt: now,
    updatedAt: now,
  }

  skills.push(skill)
  saveAgentSkills(agentId, skills)

  return skill
}

export function listAgentSkills(agentId: string): AgentSkill[] {
  return loadAgentSkills(agentId)
}

export function getSkill(agentId: string, skillId: string): AgentSkill | null {
  const skills = loadAgentSkills(agentId)
  return skills.find((s) => s.skillId === skillId) ?? null
}

export function searchSkills(filters: SkillSearchFilters = {}): AgentSkill[] {
  ensureSkillsDir()

  if (!fs.existsSync(SKILLS_DIR)) {
    return []
  }

  const allSkills: AgentSkill[] = []
  const files = fs.readdirSync(SKILLS_DIR)

  for (const file of files) {
    if (!file.endsWith('.json')) continue

    const agentId = file.replace('.json', '')
    if (filters.agentId && agentId !== filters.agentId) continue

    const skills = loadAgentSkills(agentId)
    allSkills.push(...skills)
  }

  let filtered = allSkills

  if (filters.q) {
    const query = filters.q.toLowerCase()
    filtered = filtered.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.skillId.toLowerCase().includes(query),
    )
  }

  if (filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice)) {
    filtered = filtered.filter((skill) => skill.priceXlm <= filters.maxPrice!)
  }

  return filtered.sort((a, b) => a.priceXlm - b.priceXlm)
}

export function resetSkillsForTests(): void {
  if (fs.existsSync(SKILLS_DIR)) {
    const files = fs.readdirSync(SKILLS_DIR)
    for (const file of files) {
      fs.unlinkSync(path.join(SKILLS_DIR, file))
    }
  }
}
