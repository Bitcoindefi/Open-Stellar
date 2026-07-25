import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  registerSkill,
  listAgentSkills,
  getSkill,
  searchSkills,
  resetSkillsForTests,
} from './skills-registry'
import fs from 'node:fs'
import path from 'node:path'

const SKILLS_DIR = path.join(process.cwd(), '.data', 'skills')

describe('skills-registry', () => {
  beforeEach(() => {
    resetSkillsForTests()
  })

  afterEach(() => {
    resetSkillsForTests()
  })

  describe('registerSkill', () => {
    it('registers a new skill', () => {
      const skill = registerSkill({
        skillId: 'payment-processing',
        agentId: 'agent-001',
        name: 'Payment Processing',
        description: 'Process crypto payments',
        priceXlm: 5,
        endpoint: 'https://agent001.example.com/skills/payment',
      })

      expect(skill.skillId).toBe('payment-processing')
      expect(skill.agentId).toBe('agent-001')
      expect(skill.name).toBe('Payment Processing')
      expect(skill.description).toBe('Process crypto payments')
      expect(skill.priceXlm).toBe(5)
      expect(skill.endpoint).toBe('https://agent001.example.com/skills/payment')
      expect(skill.createdAt).toBeDefined()
      expect(skill.updatedAt).toBeDefined()
    })

    it('persists skill to disk', () => {
      registerSkill({
        skillId: 'data-analysis',
        agentId: 'agent-002',
        name: 'Data Analysis',
        description: 'Analyze large datasets',
        priceXlm: 10,
        endpoint: 'https://agent002.example.com/analyze',
      })

      const filePath = path.join(SKILLS_DIR, 'agent-002.json')
      expect(fs.existsSync(filePath)).toBe(true)

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      expect(content.skills).toHaveLength(1)
      expect(content.skills[0].skillId).toBe('data-analysis')
    })

    it('throws error for duplicate skillId', () => {
      registerSkill({
        skillId: 'translation',
        agentId: 'agent-003',
        name: 'Translation',
        description: 'Translate text',
        priceXlm: 2,
        endpoint: 'https://agent003.example.com/translate',
      })

      expect(() =>
        registerSkill({
          skillId: 'translation',
          agentId: 'agent-003',
          name: 'Translation V2',
          description: 'Better translation',
          priceXlm: 3,
          endpoint: 'https://agent003.example.com/translate-v2',
        }),
      ).toThrow('Skill translation already exists for agent agent-003')
    })

    it('validates required fields', () => {
      expect(() =>
        registerSkill({
          skillId: '',
          agentId: 'agent-004',
          name: 'Test',
          description: 'Test',
          priceXlm: 1,
          endpoint: 'http://example.com',
        }),
      ).toThrow('skillId is required')

      expect(() =>
        registerSkill({
          skillId: 'test',
          agentId: '',
          name: 'Test',
          description: 'Test',
          priceXlm: 1,
          endpoint: 'http://example.com',
        }),
      ).toThrow('agentId is required')

      expect(() =>
        registerSkill({
          skillId: 'test',
          agentId: 'agent-004',
          name: '',
          description: 'Test',
          priceXlm: 1,
          endpoint: 'http://example.com',
        }),
      ).toThrow('name is required')

      expect(() =>
        registerSkill({
          skillId: 'test',
          agentId: 'agent-004',
          name: 'Test',
          description: '',
          priceXlm: 1,
          endpoint: 'http://example.com',
        }),
      ).toThrow('description is required')

      expect(() =>
        registerSkill({
          skillId: 'test',
          agentId: 'agent-004',
          name: 'Test',
          description: 'Test',
          priceXlm: -1,
          endpoint: 'http://example.com',
        }),
      ).toThrow('priceXlm must be >= 0')

      expect(() =>
        registerSkill({
          skillId: 'test',
          agentId: 'agent-004',
          name: 'Test',
          description: 'Test',
          priceXlm: 1,
          endpoint: '',
        }),
      ).toThrow('endpoint is required')
    })
  })

  describe('listAgentSkills', () => {
    it('returns empty array for agent with no skills', () => {
      const skills = listAgentSkills('nonexistent-agent')
      expect(skills).toEqual([])
    })

    it('returns all skills for an agent', () => {
      registerSkill({
        skillId: 'skill-1',
        agentId: 'agent-005',
        name: 'Skill 1',
        description: 'First skill',
        priceXlm: 1,
        endpoint: 'http://example.com/1',
      })

      registerSkill({
        skillId: 'skill-2',
        agentId: 'agent-005',
        name: 'Skill 2',
        description: 'Second skill',
        priceXlm: 2,
        endpoint: 'http://example.com/2',
      })

      const skills = listAgentSkills('agent-005')
      expect(skills).toHaveLength(2)
      expect(skills.map((s) => s.skillId)).toContain('skill-1')
      expect(skills.map((s) => s.skillId)).toContain('skill-2')
    })
  })

  describe('getSkill', () => {
    it('returns null for nonexistent skill', () => {
      const skill = getSkill('agent-006', 'nonexistent')
      expect(skill).toBeNull()
    })

    it('returns skill by id', () => {
      registerSkill({
        skillId: 'image-gen',
        agentId: 'agent-007',
        name: 'Image Generation',
        description: 'Generate AI images',
        priceXlm: 8,
        endpoint: 'http://example.com/image-gen',
      })

      const skill = getSkill('agent-007', 'image-gen')
      expect(skill).not.toBeNull()
      expect(skill?.skillId).toBe('image-gen')
      expect(skill?.name).toBe('Image Generation')
    })
  })

  describe('searchSkills', () => {
    beforeEach(() => {
      registerSkill({
        skillId: 'payment',
        agentId: 'agent-search-1',
        name: 'Payment Processing',
        description: 'Handle crypto payments securely',
        priceXlm: 5,
        endpoint: 'http://example.com/payment',
      })

      registerSkill({
        skillId: 'translation',
        agentId: 'agent-search-2',
        name: 'Language Translation',
        description: 'Translate between 50+ languages',
        priceXlm: 2,
        endpoint: 'http://example.com/translate',
      })

      registerSkill({
        skillId: 'sentiment',
        agentId: 'agent-search-3',
        name: 'Sentiment Analysis',
        description: 'Analyze text sentiment and emotions',
        priceXlm: 3,
        endpoint: 'http://example.com/sentiment',
      })
    })

    it('returns all skills without filters', () => {
      const skills = searchSkills()
      expect(skills).toHaveLength(3)
    })

    it('filters by search query - name match', () => {
      const skills = searchSkills({ q: 'payment' })
      expect(skills).toHaveLength(1)
      expect(skills[0].skillId).toBe('payment')
    })

    it('filters by search query - description match', () => {
      const skills = searchSkills({ q: 'translate' })
      expect(skills).toHaveLength(1)
      expect(skills[0].skillId).toBe('translation')
    })

    it('filters by search query - case insensitive', () => {
      const skills = searchSkills({ q: 'PAYMENT' })
      expect(skills).toHaveLength(1)
      expect(skills[0].skillId).toBe('payment')
    })

    it('filters by maxPrice', () => {
      const skills = searchSkills({ maxPrice: 3 })
      expect(skills).toHaveLength(2)
      expect(skills.map((s) => s.skillId)).toContain('translation')
      expect(skills.map((s) => s.skillId)).toContain('sentiment')
    })

    it('combines search query and maxPrice', () => {
      const skills = searchSkills({ q: 'analysis', maxPrice: 5 })
      expect(skills).toHaveLength(1)
      expect(skills[0].skillId).toBe('sentiment')
    })

    it('returns empty array when no matches', () => {
      const skills = searchSkills({ q: 'nonexistent-skill' })
      expect(skills).toEqual([])
    })

    it('sorts by price ascending', () => {
      const skills = searchSkills()
      expect(skills[0].priceXlm).toBe(2)
      expect(skills[1].priceXlm).toBe(3)
      expect(skills[2].priceXlm).toBe(5)
    })
  })
})
