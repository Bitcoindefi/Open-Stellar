import { describe, expect, it } from "vitest"
import { parse } from "yaml"

import { POST as registerAgent } from "@/app/api/agents/route"
import { GET as getOpenApiYaml } from "@/app/api/openapi.yaml/route"
import { resetAgentRegistryForTests } from "@/lib/agent-registry"
import { agentRegistrationSchema } from "@/lib/openapi/schemas"

type Operation = {
  requestBody?: unknown
  responses: Record<string, unknown>
}

type OpenApiDocument = {
  openapi: string
  paths: Record<string, Record<string, Operation>>
  components: {
    schemas: Record<string, Record<string, unknown>>
  }
}

describe("GET /api/openapi.yaml", () => {
  it("serves a parseable YAML specification for the issue #203 route groups", async () => {
    const response = getOpenApiYaml()
    const source = await response.text()
    const spec = parse(source) as OpenApiDocument

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/yaml")
    expect(spec.openapi).toBe("3.0.3")

    expect(spec.paths["/api/protocol/x402/quote"]).toHaveProperty("post")
    expect(spec.paths["/api/protocol/x402/settle"]).toHaveProperty("post")
    expect(spec.paths["/api/protocol/x402/receipts"]).toHaveProperty("get")
    expect(spec.paths["/api/agents"]).toMatchObject({ get: expect.any(Object), post: expect.any(Object) })
    expect(spec.paths["/api/registry"]).toHaveProperty("get")
    expect(spec.paths["/api/tasks"]).toMatchObject({ get: expect.any(Object), post: expect.any(Object) })
    expect(spec.paths["/api/quests"]).toMatchObject({ get: expect.any(Object), post: expect.any(Object) })
    expect(spec.paths["/api/leaderboard"]).toHaveProperty("get")
    expect(spec.paths["/api/webhooks"]).toMatchObject({ get: expect.any(Object), post: expect.any(Object) })

    for (const methods of Object.values(spec.paths)) {
      for (const operation of Object.values(methods)) {
        expect(operation.responses).toBeDefined()
      }
    }
  })

  it("links the agent registration contract to the shared Zod schema", async () => {
    const spec = parse(await getOpenApiYaml().text()) as OpenApiDocument

    expect(spec.components.schemas.AgentRegistrationRequest["x-zod-schema"])
      .toBe("lib/openapi/schemas.ts#agentRegistrationSchema")
    expect(agentRegistrationSchema.safeParse({ agentId: "missing-fields" }).success).toBe(false)
  })
})

describe("POST /api/agents OpenAPI validation", () => {
  it("rejects a body that does not match AgentRegistrationRequest", async () => {
    resetAgentRegistryForTests()
    const response = await registerAgent(new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "agent-invalid" }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Invalid agent registration",
    })
  })
})
