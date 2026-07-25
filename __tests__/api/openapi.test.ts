import { describe, expect, it } from "vitest"

import { GET } from "@/app/api/openapi.json/route"

type OpenApiOperation = {
  parameters?: Array<{ name: string; in: string; required?: boolean }>
  responses?: Record<string, { headers?: Record<string, unknown> }>
}

type OpenApiSpec = {
  openapi: string
  paths: Record<string, Record<string, OpenApiOperation>>
}

async function loadSpec(): Promise<OpenApiSpec> {
  const response = GET()
  expect(response.status).toBe(200)
  return await response.json() as OpenApiSpec
}

function expectPathParam(operation: OpenApiOperation, name: string) {
  expect(operation.parameters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name, in: "path", required: true }),
    ]),
  )
}

function expectRateLimited(operation: OpenApiOperation) {
  expect(operation.responses).toHaveProperty("429")
  expect(operation.responses?.["429"].headers).toHaveProperty("Retry-After")
}

describe("GET /api/openapi.json", () => {
  it("documents implemented agent task/rate-limit endpoints plus shared rate-limit responses", async () => {
    const spec = await loadSpec()

    expect(spec.openapi).toBe("3.1.0")

    expect(spec.paths["/api/agents/{id}/task"]).toHaveProperty("get")
    expect(spec.paths["/api/agents/{id}/task"]).toHaveProperty("post")
    expectPathParam(spec.paths["/api/agents/{id}/task"].get, "id")
    expectPathParam(spec.paths["/api/agents/{id}/task"].post, "id")

    expect(spec.paths["/api/agents/{id}/rate-limit/status"]).toHaveProperty("get")
    expectPathParam(spec.paths["/api/agents/{id}/rate-limit/status"].get, "id")

    expect(spec.paths["/api/notifications"]).toHaveProperty("get")
    expect(spec.paths["/api/notifications"]).toHaveProperty("post")
    expect(spec.paths["/api/notifications/preferences"]).toHaveProperty("get")
    expect(spec.paths["/api/notifications/preferences"]).toHaveProperty("patch")

    expect(spec.paths["/api/quests/{id}/subtasks"]).toHaveProperty("post")
    expectPathParam(spec.paths["/api/quests/{id}/subtasks"].post, "id")

    expect(spec.paths["/api/quests/{id}/subtasks/{subtaskId}"]).toHaveProperty("patch")
    expectPathParam(spec.paths["/api/quests/{id}/subtasks/{subtaskId}"].patch, "id")
    expectPathParam(spec.paths["/api/quests/{id}/subtasks/{subtaskId}"].patch, "subtaskId")

    expect(spec.paths["/api/quests/{id}/chain"]).toHaveProperty("get")
    expectPathParam(spec.paths["/api/quests/{id}/chain"].get, "id")

    expect(spec.paths["/api/leaderboard"]).toHaveProperty("get")

    for (const path of [
      "/api/agents/{id}/dependencies",
      "/api/agents/{id}/dependents",
    ]) {
      expect(spec.paths[path]).toHaveProperty("get")
      expectPathParam(spec.paths[path].get, "id")
      expect(spec.paths[path].get.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "flat", in: "query" }),
          expect.objectContaining({ name: "maxDepth", in: "query" }),
        ]),
      )
    }

    for (const operation of [
      spec.paths["/api/agents/{id}/task"].get,
      spec.paths["/api/agents/{id}/task"].post,
      spec.paths["/api/agents/{id}/rate-limit/status"].get,
      spec.paths["/api/agents/{id}/dependencies"].get,
      spec.paths["/api/agents/{id}/dependents"].get,
      spec.paths["/api/notifications"].get,
      spec.paths["/api/notifications"].post,
      spec.paths["/api/notifications/preferences"].get,
      spec.paths["/api/notifications/preferences"].patch,
      spec.paths["/api/quests/{id}/subtasks"].post,
      spec.paths["/api/quests/{id}/subtasks/{subtaskId}"].patch,
      spec.paths["/api/quests/{id}/chain"].get,
      spec.paths["/api/leaderboard"].get,
    ]) {
      expectRateLimited(operation)
    }

    expect(spec.paths["/api/webhooks"]).toHaveProperty("get")
    expect(spec.paths["/api/webhooks"]).toHaveProperty("post")
    expect(spec.paths["/api/webhooks/{id}"]).toHaveProperty("delete")
    expect(spec.paths["/api/webhooks/{id}/rotate"]).toHaveProperty("post")
    expect(spec.paths["/api/webhooks/event-types"]).toHaveProperty("get")
  })
})
