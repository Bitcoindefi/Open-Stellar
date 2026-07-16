/**
 * Skill Registry integration for PR#304
 * This bridges the skill listing API with the x402 payment flow.
 */

export interface SkillListingRecord {
  id: string
  name: string
  description: string
  callUrl: string
  priceXLM: number
  ownerWallet: string
  ownerAgentId: string
  category: string
  tags: string[]
  createdAt: string
  updatedAt: string
  active: boolean
  invocationCount: number
  rating: number
}

// In-memory store aligned with PR#304 pending API
const globalState = globalThis as typeof globalThis & {
  __skillListingRegistry__?: Map<string, SkillListingRecord>
}

const registry: Map<string, SkillListingRecord> =
  globalState.__skillListingRegistry__ ?? new Map()

if (!globalState.__skillListingRegistry__) {
  globalState.__skillListingRegistry__ = registry
}

export function registerSkill(listing: Omit<SkillListingRecord, 'id' | 'createdAt' | 'updatedAt' | 'invocationCount' | 'rating'>): SkillListingRecord {
  const id = `skill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const record: SkillListingRecord = {
    ...listing,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    invocationCount: 0,
    rating: 0,
  }
  registry.set(id, record)
  return record
}

export function getSkill(id: string): SkillListingRecord | undefined {
  return registry.get(id)
}

export function listSkills(filters?: {
  category?: string
  ownerAgentId?: string
  active?: boolean
  minPrice?: number
  maxPrice?: number
}): SkillListingRecord[] {
  let results = Array.from(registry.values())

  if (filters?.category) {
    results = results.filter((s) => s.category === filters.category)
  }
  if (filters?.ownerAgentId) {
    results = results.filter((s) => s.ownerAgentId === filters.ownerAgentId)
  }
  if (filters?.active !== undefined) {
    results = results.filter((s) => s.active === filters.active)
  }
  if (filters?.minPrice !== undefined) {
    results = results.filter((s) => s.priceXLM >= filters.minPrice!)
  }
  if (filters?.maxPrice !== undefined) {
    results = results.filter((s) => s.priceXLM <= filters.maxPrice!)
  }

  return results.sort((a, b) => b.rating - a.rating)
}

export function incrementSkillInvocation(id: string): SkillListingRecord | undefined {
  const skill = registry.get(id)
  if (!skill) return undefined
  skill.invocationCount += 1
  skill.updatedAt = new Date().toISOString()
  registry.set(id, skill)
  return skill
}

export function resetSkillRegistryForTests(): void {
  registry.clear()
}