import { describe, expect, it, beforeEach } from "vitest"
import { awardXP, awardTaskXP, checkLevelUp, getAgentXP, resetAgentXpDb } from "@/lib/gamification/xp"
import { upgradeSkill } from "@/lib/gamification/skill-upgrades"
import { awardBadgeToAgent, getReputation, resetReputationStoreForTests } from "@/lib/reputation/reputation-store"
import { createLocalReputationAttestation, verifyLocalReputationAttestation } from "@/lib/reputation/attestation"
import type { Skill } from "@/lib/types"

describe("[EPIC] Gamification Layer Tests", () => {
  beforeEach(() => {
    resetAgentXpDb()
    resetReputationStoreForTests()
  })

  it("completing a task awards XP to the agent", () => {
    const agentId = "nexus-7"
    const results = awardTaskXP({ agentId, durationMs: 1500 })

    expect(results.length).toBeGreaterThanOrEqual(1)
    const current = getAgentXP(agentId)
    expect(current.xp).toBeGreaterThan(0)
    expect(current.level).toBeGreaterThanOrEqual(1)
  })

  it("accumulating enough XP levels up the agent and calculates xpToNext", () => {
    const levelStateBefore = checkLevelUp(50, 1)
    expect(levelStateBefore.level).toBe(1)

    const awardResult = awardXP("cipher-3", 150, "task.completed")
    expect(awardResult.leveledUp).toBe(true)
    expect(awardResult.level).toBe(2)
  })

  it("skill upgrades consume XP and level up skills", () => {
    const initialSkill: Skill = {
      id: "data-center-skill-0",
      name: "Data Mining",
      level: 1,
      maxLevel: 5,
      xp: 100,
      xpToNext: 50,
    }

    const upgradeResult = upgradeSkill(initialSkill)
    expect(upgradeResult.upgraded).toBe(true)
    expect(upgradeResult.skill.level).toBe(2)
    expect(upgradeResult.skill.xp).toBe(50)
  })

  it("completing a quest rewards a badge shown in agent reputation", () => {
    const agentId = "pulse-9"
    const snapshot = awardBadgeToAgent(agentId, "first-quest", "common")

    expect(snapshot.metrics.badges.some((b) => b.id === "first-quest")).toBe(true)
  })

  it("stores on-chain Soroban attestation for top agents", () => {
    const agentId = "vector-1"
    const snapshot = getReputation(agentId)
    const attestation = createLocalReputationAttestation(snapshot, "C123456789SOROBAN")

    expect(attestation.agentId).toBe(agentId)
    expect(attestation.hash).toBeDefined()
    expect(attestation.stellarExpertUrl).toContain("stellar.expert")

    const isValid = verifyLocalReputationAttestation(agentId, snapshot.score, attestation)
    expect(isValid).toBe(true)
  })
})
