import { afterEach, describe, expect, it } from "vitest"
import { DELETE as deleteSkill } from "@/app/api/marketplace/skills/[skillId]/route"
import { GET as getSkills, POST as postSkill } from "@/app/api/marketplace/skills/route"
import {
  deactivateSkill,
  listSkills,
  registerSkill,
  resetSkillStore,
} from "@/lib/marketplace/skill-store"

function context(skillId: string) {
  return { params: Promise.resolve({ skillId }) }
}

afterEach(() => {
  resetSkillStore()
})

describe("skill-store library unit tests", () => {
  it("registers a skill successfully", () => {
    const skill = registerSkill({
      agentId: "agent-1",
      name: "pdf-to-text",
      description: "Converts PDF documents to text",
      priceXLM: 0.5,
      callUrl: "https://agent1.ai/skills/pdf-to-text",
    })

    expect(skill.id).toBeDefined()
    expect(skill.agentId).toBe("agent-1")
    expect(skill.name).toBe("pdf-to-text")
    expect(skill.priceXLM).toBe(0.5)
    expect(skill.callUrl).toBe("https://agent1.ai/skills/pdf-to-text")
    expect(skill.active).toBe(true)
    expect(typeof skill.createdAt).toBe("number")
  })

  it("validates priceXLM boundaries (>0 and <=100)", () => {
    expect(() =>
      registerSkill({
        agentId: "agent-1",
        name: "test-skill",
        description: "test",
        priceXLM: 0,
        callUrl: "https://example.com/skill",
      }),
    ).toThrow("priceXLM must be > 0 and <= 100 XLM")

    expect(() =>
      registerSkill({
        agentId: "agent-1",
        name: "test-skill",
        description: "test",
        priceXLM: -1,
        callUrl: "https://example.com/skill",
      }),
    ).toThrow("priceXLM must be > 0 and <= 100 XLM")

    expect(() =>
      registerSkill({
        agentId: "agent-1",
        name: "test-skill",
        description: "test",
        priceXLM: 100.1,
        callUrl: "https://example.com/skill",
      }),
    ).toThrow("priceXLM must be > 0 and <= 100 XLM")

    // 100 is valid
    const validSkill = registerSkill({
      agentId: "agent-1",
      name: "test-skill",
      description: "test",
      priceXLM: 100,
      callUrl: "https://example.com/skill",
    })
    expect(validSkill.priceXLM).toBe(100)
  })

  it("enforces HTTPS for callUrl", () => {
    expect(() =>
      registerSkill({
        agentId: "agent-1",
        name: "test-skill",
        description: "test",
        priceXLM: 1,
        callUrl: "http://example.com/skill",
      }),
    ).toThrow("callUrl must be HTTPS")
  })

  it("filters skills by name, maxPriceXLM, and agentId", () => {
    registerSkill({
      agentId: "agent-1",
      name: "pdf-to-text",
      description: "PDF converter",
      priceXLM: 2.0,
      callUrl: "https://agent1.ai/pdf",
    })

    registerSkill({
      agentId: "agent-1",
      name: "soroban-deploy",
      description: "Deploy Soroban contract",
      priceXLM: 10.0,
      callUrl: "https://agent1.ai/deploy",
    })

    registerSkill({
      agentId: "agent-2",
      name: "pdf-parser",
      description: "Another PDF tool",
      priceXLM: 0.5,
      callUrl: "https://agent2.ai/pdf",
    })

    // List all
    expect(listSkills()).toHaveLength(3)

    // Filter by name
    const pdfSkills = listSkills({ name: "pdf" })
    expect(pdfSkills).toHaveLength(2)

    // Filter by maxPriceXLM
    const cheapSkills = listSkills({ maxPriceXLM: 1.0 })
    expect(cheapSkills).toHaveLength(1)
    expect(cheapSkills[0].name).toBe("pdf-parser")

    // Filter by agentId
    const agent1Skills = listSkills({ agentId: "agent-1" })
    expect(agent1Skills).toHaveLength(2)

    // Combined filter
    const combined = listSkills({ name: "pdf", maxPriceXLM: 1.0 })
    expect(combined).toHaveLength(1)
    expect(combined[0].agentId).toBe("agent-2")
  })

  it("enforces limit of 20 active skills per agent (21st returns 429)", () => {
    for (let i = 1; i <= 20; i++) {
      registerSkill({
        agentId: "busy-agent",
        name: `skill-${i}`,
        description: "skill desc",
        priceXLM: 1,
        callUrl: `https://busy-agent.com/skill-${i}`,
      })
    }

    try {
      registerSkill({
        agentId: "busy-agent",
        name: "skill-21",
        description: "skill desc",
        priceXLM: 1,
        callUrl: "https://busy-agent.com/skill-21",
      })
      expect.fail("Should have thrown error on 21st skill")
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number }
      expect(error.statusCode).toBe(429)
      expect(error.message).toContain("maximum limit of 20 active skills")
    }
  })

  it("deactivates skill so it disappears from listings", () => {
    const skill = registerSkill({
      agentId: "agent-1",
      name: "test-deactivate",
      description: "desc",
      priceXLM: 1,
      callUrl: "https://example.com/skill",
    })

    expect(listSkills()).toHaveLength(1)

    // Deactivate by non-owner fails
    expect(() => deactivateSkill(skill.id, "agent-2")).toThrow("Unauthorized")

    // Deactivate by owner succeeds
    const result = deactivateSkill(skill.id, "agent-1")
    expect(result).toBe(true)

    // Disappears from GET results
    expect(listSkills()).toHaveLength(0)
  })
})

describe("marketplace skills API routes", () => {
  it("POST /api/marketplace/skills creates skill and GET returns it", async () => {
    const postReq = new Request("http://localhost/api/marketplace/skills", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer agent-api-1",
      },
      body: JSON.stringify({
        name: "soroban-deploy",
        description: "Deploys contracts to Soroban testnet",
        priceXLM: 5,
        callUrl: "https://agent-api-1.com/deploy",
      }),
    })

    const postRes = await postSkill(postReq)
    const postData = await postRes.json()

    expect(postRes.status).toBe(201)
    expect(postData.ok).toBe(true)
    expect(postData.skill.name).toBe("soroban-deploy")
    expect(postData.skill.agentId).toBe("agent-api-1")

    const getReq = new Request("http://localhost/api/marketplace/skills")
    const getRes = await getSkills(getReq)
    const getData = await getRes.json()

    expect(getRes.status).toBe(200)
    expect(getData.ok).toBe(true)
    expect(getData.skills).toHaveLength(1)
    expect(getData.skills[0].name).toBe("soroban-deploy")
  })

  it("GET /api/marketplace/skills filters by maxPriceXLM", async () => {
    await postSkill(
      new Request("http://localhost/api/marketplace/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer agent-1" },
        body: JSON.stringify({ name: "expensive", description: "expensive skill", priceXLM: 10, callUrl: "https://a.com/e" }),
      }),
    )

    await postSkill(
      new Request("http://localhost/api/marketplace/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer agent-1" },
        body: JSON.stringify({ name: "cheap", description: "cheap skill", priceXLM: 0.5, callUrl: "https://a.com/c" }),
      }),
    )

    const req = new Request("http://localhost/api/marketplace/skills?maxPriceXLM=1")
    const res = await getSkills(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.skills).toHaveLength(1)
    expect(data.skills[0].name).toBe("cheap")
  })

  it("DELETE /api/marketplace/skills/[skillId] deactivates skill", async () => {
    const postReq = new Request("http://localhost/api/marketplace/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer agent-owner" },
      body: JSON.stringify({ name: "to-delete", description: "delete me", priceXLM: 1, callUrl: "https://a.com/del" }),
    })
    const postRes = await postSkill(postReq)
    const postData = await postRes.json()
    const skillId = postData.skill.id

    // Attempt delete without auth
    const unauthDeleteReq = new Request(`http://localhost/api/marketplace/skills/${skillId}`, { method: "DELETE" })
    const unauthRes = await deleteSkill(unauthDeleteReq, context(skillId))
    expect(unauthRes.status).toBe(401)

    // Attempt delete with wrong agent auth
    const wrongAuthDeleteReq = new Request(`http://localhost/api/marketplace/skills/${skillId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer wrong-agent" },
    })
    const wrongAuthRes = await deleteSkill(wrongAuthDeleteReq, context(skillId))
    expect(wrongAuthRes.status).toBe(403)

    // Delete with owner auth
    const ownerDeleteReq = new Request(`http://localhost/api/marketplace/skills/${skillId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer agent-owner" },
    })
    const ownerRes = await deleteSkill(ownerDeleteReq, context(skillId))
    expect(ownerRes.status).toBe(200)

    // Verify GET no longer returns the deactivated skill
    const getRes = await getSkills(new Request("http://localhost/api/marketplace/skills"))
    const getData = await getRes.json()
    expect(getData.skills).toHaveLength(0)
  })
})
