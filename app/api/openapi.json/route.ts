import { NextResponse } from "next/server"

import { NOTIFICATION_TYPES } from "@/lib/notifications/notification-store"

const json = { "application/json": { schema: { type: "object" } } }
const error = { description: "Error", content: json }
const notFound = { description: "Not found", content: json }
const rateLimit = {
  description: "Too Many Requests",
  headers: {
    "Retry-After": {
      description: "Seconds to wait before retrying the request.",
      schema: { type: "integer", minimum: 1 },
    },
  },
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: { type: "string", enum: ["rate_limit_exceeded"] },
        },
        required: ["ok", "error"],
      },
    },
  },
}

const notificationSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    cursor: { type: "string" },
    agentId: { type: "string" },
    type: { type: "string", enum: [...NOTIFICATION_TYPES] },
    title: { type: "string" },
    body: { type: "string" },
    resourceHref: { type: "string" },
    resourceLabel: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    readAt: { type: "string", nullable: true, format: "date-time" },
    dedupeKey: { type: "string" },
  },
  required: ["id", "cursor", "agentId", "type", "title", "body", "resourceHref", "resourceLabel", "createdAt", "readAt"],
}

const subTaskSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    assignedAgentId: { type: "string" },
    dependsOn: { type: "array", items: { type: "string" } },
    status: { type: "string", enum: ["pending", "in_progress", "done"] },
    completedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "title", "status"],
}

const leaderboardAgentSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    district: { type: "string" },
    districtName: { type: "string" },
    districtColor: { type: "string" },
    tasksCompleted: { type: "integer" },
    weeklyTasks: { type: "integer" },
    level: { type: "integer" },
    xp: { type: "integer" },
    x402Revenue: { type: "number" },
    spriteId: { type: "integer" },
    badges: { type: "array", items: { type: "string" } },
    rank: { type: "integer" },
    previousRank: { type: "integer" },
    districtRank: { type: "integer" },
    globalRank: { type: "integer" },
  },
  required: ["id", "name", "district", "tasksCompleted", "weeklyTasks", "level", "xp", "x402Revenue", "rank", "previousRank", "districtRank", "globalRank"],
}

const spec = {
  openapi: "3.1.0",
  info: { title: "Open Stellar API", version: "0.2.0", description: "Developer API for Open Stellar agents, x402 payments, ZK Passport, reputation, Stellar helpers, feeds, and admin workflows." },
  servers: [{ url: "https://open-stellar.example", description: "Replace with your deployment URL" }],
  tags: [
    { name: "Agents" }, { name: "Protocol" }, { name: "Stellar" }, { name: "Events" }, { name: "Webhooks" }, { name: "Admin" }, { name: "User" }, { name: "Explorer" }, { name: "Prices" }, { name: "Notifications" }, { name: "Quests" }, { name: "Leaderboard" },
  ],
  paths: {
    "/api/agents/{id}/messages": { post: op("Agents", "Send a message to an agent", ["id"], { role: "user", content: "Hello" }) },
    "/api/agents/{id}/health": { get: op("Agents", "Read agent health", ["id"]) },
    "/api/agents/{id}/heartbeat": { post: op("Agents", "Record agent heartbeat", ["id"], { status: "active", load: 0.2 }) },
    "/api/agents/{id}/dependencies": {
      get: op("Agents", "Read an agent dependency graph", ["id"], undefined, {
        query: [
          queryParam("flat", { type: "boolean" }),
          queryParam("maxDepth", { type: "integer", minimum: 0, maximum: 10 }),
        ],
        responseSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            dependencies: { type: "array" },
            totalCount: { type: "integer" },
            maxDepth: { type: "integer" },
          },
          required: ["agentId", "dependencies"],
        },
        responses: { 404: notFound },
      }),
    },
    "/api/agents/{id}/dependents": {
      get: op("Agents", "Read an agent dependent graph", ["id"], undefined, {
        query: [
          queryParam("flat", { type: "boolean" }),
          queryParam("maxDepth", { type: "integer", minimum: 0, maximum: 10 }),
        ],
        responseSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            dependents: { type: "array" },
            totalCount: { type: "integer" },
            maxDepth: { type: "integer" },
          },
          required: ["agentId", "dependents"],
        },
        responses: { 404: notFound },
      }),
    },
    "/api/agents/{id}/appearance": { get: op("Agents", "Read agent appearance", ["id"]), post: op("Agents", "Update agent appearance", ["id"], { skin: "default", accessories: [] }) },
    "/api/agents/{id}/credential": { post: op("Agents", "Issue a reputation credential", ["id"], { contractId: "optional-soroban-contract-id" }) },
    "/api/agents/{id}/credential/latest": { get: op("Agents", "Read latest reputation credential", ["id"]) },
    "/api/agents/{id}/webhooks/failures": {
      get: op("Agents", "List dead webhook deliveries for an agent", ["id"], undefined, {
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              webhookId: { type: "string" },
              payload: { type: "object" },
              attempts: { type: "integer" },
              nextRetryAt: { type: "integer" },
              lastError: { type: "string" },
              createdAt: { type: "integer" },
              status: { type: "string", enum: ["dead"] },
            },
            required: ["id", "webhookId", "payload", "attempts", "nextRetryAt", "createdAt", "status"],
          },
        },
      }),
    },
    "/api/protocol/x402/quote": { get: op("Protocol", "Create an x402 payment quote"), post: op("Protocol", "Create an x402 payment quote", [], { serviceId: "weather.v1", amount: "0.25", payer: "agent-nexus" }) },
    "/api/protocol/x402/settle": { post: op("Protocol", "Settle an x402 payment", [], { quoteId: "quote_123", paymentSource: "stellar:testnet" }) },
    "/api/protocol/passport/authorize": { post: op("Protocol", "Authorize a spend with ZK Passport", [], { agentId: "agent-nexus", amount: "0.25", quoteId: "quote_123" }) },
    "/api/protocol/passport/status": { get: op("Protocol", "Lookup passport status") },
    "/api/protocol/reputation": { get: op("Protocol", "Query reputation"), post: op("Protocol", "Record reputation action", [], { actorId: "agent-nexus", delta: 1, reason: "paid-delivery", scope: "tx" }) },
    "/api/protocol/track8004": { get: op("Protocol", "Resolve ERC-8004 style agent identity") },
    "/api/stellar/balance": { post: op("Stellar", "Read Stellar balance", [], { publicKey: "G..." }) },
    "/api/stellar/build-tx": { post: op("Stellar", "Build a Stellar transaction", [], { sourcePublic: "G...", destination: "G...", amount: "1" }) },
    "/api/stellar/submit-tx": { post: op("Stellar", "Submit a signed Stellar transaction", [], { xdr: "AAAA..." }) },
    "/api/stellar/fund": { post: op("Stellar", "Fund a testnet account with Friendbot", [], { publicKey: "G..." }) },
    "/api/events": { get: op("Events", "List system events"), post: op("Events", "Create a system event", [], { type: "agent.task.completed", agentId: "agent-nexus" }) },
    "/api/events/{agentId}": { get: op("Events", "List events for an agent", ["agentId"]) },
    "/api/webhooks": { get: op("Webhooks", "List webhook registrations"), post: op("Webhooks", "Create a webhook registration", [], { url: "https://partner.example/hooks", events: ["agent.status"] }) },
    "/api/webhooks/{id}": { delete: op("Webhooks", "Delete a webhook registration", ["id"]) },
    "/api/webhooks/{id}/rotate": { post: op("Webhooks", "Rotate a webhook signing secret", ["id"]) },
    "/api/webhooks/event-types": { get: op("Webhooks", "List supported webhook event types") },
    "/api/cron/webhook-retry": {
      post: op("Webhooks", "Retry due webhook deliveries", [], undefined, {
        responseSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [true] },
            processed: { type: "integer" },
            succeeded: { type: "integer" },
            failed: { type: "integer" },
            dead: { type: "integer" },
          },
          required: ["ok", "processed", "succeeded", "failed", "dead"],
        },
      }),
    },
    "/api/feed": { get: op("Events", "List public activity feed") },
    "/api/districts/{districtId}/broadcast": { post: op("Events", "Broadcast a district event", ["districtId"], { message: "Throughput race started" }) },
    "/api/explorer/receipts": { get: op("Explorer", "List payment receipts") },
    "/api/notifications": {
      get: op("Notifications", "List unseen notifications", [], undefined, {
        query: [
          queryParam("agentId", { type: "string" }, true),
          queryParam("since", { type: "string" }),
          queryParam("limit", { type: "integer", minimum: 1, maximum: 50 }),
        ],
        responseSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [true] },
            agentId: { type: "string" },
            notifications: { type: "array", items: notificationSchema },
            unreadCount: { type: "integer" },
            nextCursor: { type: "string", nullable: true },
          },
          required: ["ok", "agentId", "notifications", "unreadCount", "nextCursor"],
        },
      }),
      post: op("Notifications", "Mark all notifications read", [], { agentId: "agent-nexus" }, {
        requestBodySchema: {
          type: "object",
          properties: { agentId: { type: "string" } },
          required: ["agentId"],
        },
        responseSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [true] },
            agentId: { type: "string" },
            markedRead: { type: "integer" },
            unreadCount: { type: "integer" },
          },
          required: ["ok", "agentId", "markedRead", "unreadCount"],
        },
      }),
    },
    "/api/notifications/preferences": {
      get: op("Notifications", "Read notification preferences", [], undefined, {
        query: [queryParam("agentId", { type: "string" }, true)],
        responseSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [true] },
            agentId: { type: "string" },
            muted: { type: "array", items: { type: "string", enum: [...NOTIFICATION_TYPES] } },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["ok", "agentId", "muted", "updatedAt"],
        },
      }),
      patch: op("Notifications", "Update notification preferences", [], {
        agentId: "agent-nexus",
        muted: ["agent_offline"],
      }, {
        requestBodySchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            muted: { type: "array", items: { type: "string", enum: [...NOTIFICATION_TYPES] } },
          },
          required: ["agentId", "muted"],
        },
        responseSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [true] },
            agentId: { type: "string" },
            muted: { type: "array", items: { type: "string", enum: [...NOTIFICATION_TYPES] } },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["ok", "agentId", "muted", "updatedAt"],
        },
      }),
    },
    "/api/quests/{id}/subtasks": {
      post: op("Quests", "Create a quest subtask", ["id"], { title: "Setup service metadata", assignedAgentId: "agent-123" }, {
        successStatus: 201,
        requestBodySchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            assignedAgentId: { type: "string" },
            dependsOn: { type: "array", items: { type: "string" } },
          },
          required: ["title"],
        },
        responseSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [true] },
            subTask: subTaskSchema,
          },
          required: ["ok", "subTask"],
        },
        responses: { 404: notFound },
      }),
    },
    "/api/quests/{id}/subtasks/{subtaskId}": {
      patch: op("Quests", "Update a quest subtask", ["id", "subtaskId"], { status: "done", assignedAgentId: "agent-456" }, {
        requestBodySchema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "in_progress", "done"] },
            assignedAgentId: { type: "string" },
            dependsOn: { type: "array", items: { type: "string" } },
          },
        },
        responseSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [true] },
            subTask: subTaskSchema,
          },
          required: ["ok", "subTask"],
        },
        responses: {
          404: notFound,
          409: {
            description: "Prerequisite subtask incomplete",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [false] },
                    reason: { type: "string", enum: ["prerequisite_incomplete"] },
                    missing: { type: "array", items: { type: "string" } },
                  },
                  required: ["ok", "reason", "missing"],
                },
              },
            },
          },
        },
      }),
    },
    "/api/quests/{id}/chain": {
      get: op("Quests", "Read the forward quest chain", ["id"], undefined, {
        responseSchema: {
          type: "object",
          properties: {
            chain: { type: "array", items: { type: "string" } },
            length: { type: "integer", minimum: 1 },
          },
          required: ["chain", "length"],
        },
        responses: { 404: notFound },
      }),
    },
    "/api/leaderboard": {
      get: op("Leaderboard", "List leaderboard agents", [], undefined, {
        query: [
          queryParam("view", { type: "string", enum: ["global", "district", "week"] }),
          queryParam("district", { type: "string" }),
        ],
        responseSchema: {
          type: "object",
          properties: {
            agents: { type: "array", items: leaderboardAgentSchema },
            refreshedAt: { type: "string", format: "date-time" },
            nextResetAt: { type: "string" },
          },
          required: ["agents", "refreshedAt", "nextResetAt"],
        },
      }),
    },
    "/api/admin/runs": { get: op("Admin", "List orchestration runs"), post: op("Admin", "Create an orchestration run", [], { title: "Research run", steps: [] }) },
    "/api/admin/runs/{runId}": { get: op("Admin", "Read orchestration run", ["runId"]), post: op("Admin", "Update or re-run orchestration run", ["runId"], { action: "rerun" }) },
    "/api/user/export": { get: op("User", "Export user data") },
    "/api/user/delete-request": { post: op("User", "Request user deletion", [], { email: "operator@example.com" }) },
    "/api/prices": { get: op("Prices", "Read token price data") },
  },
}

type Schema = Record<string, unknown>
type Parameter = {
  name: string
  in: "path" | "query"
  required?: boolean
  schema: Schema
}

type OperationOptions = {
  query?: Parameter[]
  requestBodySchema?: Schema
  requestBodyRequired?: boolean
  responseSchema?: Schema
  responses?: Record<string, unknown>
  successStatus?: number
}

function queryParam(name: string, schema: Schema, required = false): Parameter {
  return { name, in: "query", required, schema }
}

function op(tag: string, summary: string, params: string[] = [], body?: unknown, options: OperationOptions = {}) {
  const successStatus = String(options.successStatus ?? 200)

  return {
    tags: [tag], summary,
    parameters: [
      ...params.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } })),
      ...(options.query ?? []),
    ],
    requestBody: body ? {
      required: options.requestBodyRequired ?? true,
      content: {
        "application/json": {
          schema: options.requestBodySchema ?? { type: "object", additionalProperties: true },
          examples: { default: { value: body } },
        },
      },
    } : undefined,
    responses: {
      [successStatus]: {
        description: "Success",
        content: options.responseSchema ? { "application/json": { schema: options.responseSchema } } : json,
      },
      400: error,
      429: rateLimit,
      500: error,
      ...(options.responses ?? {}),
    },
  }
}

export function GET() {
  return NextResponse.json(spec, { headers: { "Cache-Control": "public, max-age=3600" } })
}
