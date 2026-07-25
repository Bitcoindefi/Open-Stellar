import { describe, expect, it } from "vitest"
import { POST as issueCredential } from "@/app/api/agents/[id]/credential/route"
import { GET as getLatestCredential } from "@/app/api/agents/[id]/credential/latest/route"

describe("agent reputation credentials", () => {
  it("issues a credential with export and share metadata", async () => {
    const agentId = "credential-agent-post"
    const req = new Request(`http://localhost/api/agents/${agentId}/credential`, {
      method: "POST",
      body: JSON.stringify({ contractId: "contract-reputation-test" }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await issueCredential(req, {
      params: Promise.resolve({ id: agentId }),
    })
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.credential.agentId).toBe(agentId)
    expect(data.credential.owner).toBe(agentId)
    expect(data.credential.level).toBe(data.credential.agent.level)
    expect(data.credential.tasksCompleted).toBe(data.credential.reputation.metrics.tasksCompleted)
    expect(data.credential.successRate).toBe(data.credential.agent.successRate)
    expect(data.credential.signature).toBe(data.credential.proof.attestationHash)
    expect(data.credential.agent.id).toBe(agentId)
    expect(data.txHash).toBeNull()
    expect(data.credential.proof.type).toBe("LocalReputationAttestation")
    expect(data.credential.proof.explorerUrl).toBeNull()
    expect(data.credential.links.explorerUrl).toBeNull()
    expect(data.shareUrl).toBe(`http://localhost/credential/${agentId}`)
    expect(data.verification.result).toBe("valid")
  })

  it("returns the latest issued credential as JSON", async () => {
    const agentId = "credential-agent-latest"
    await issueCredential(new Request(`http://localhost/api/agents/${agentId}/credential`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    }), {
      params: Promise.resolve({ id: agentId }),
    })

    const res = await getLatestCredential(new Request(`http://localhost/api/agents/${agentId}/credential/latest`), {
      params: Promise.resolve({ id: agentId }),
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.credential.agent.id).toBe(agentId)
    expect(data.credential.links.shareUrl).toBe(`http://localhost/credential/${agentId}`)
    expect(data.credential.links.explorerUrl).toBeNull()
    expect(data.verification.ok).toBe(true)
  })

  it("returns 404 when no credential has been issued", async () => {
    const res = await getLatestCredential(new Request("http://localhost/api/agents/not-issued/credential/latest"), {
      params: Promise.resolve({ id: "not-issued" }),
    })
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.ok).toBe(false)
  })
})
