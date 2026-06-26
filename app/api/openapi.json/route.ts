import { NextResponse } from "next/server"

const json = { "application/json": { schema: { type: "object" } } }
const error = { description: "Error", content: json }

const spec = {
  openapi: "3.1.0",
  info: { title: "Open Stellar API", version: "0.2.0", description: "Developer API for Open Stellar agents, x402 payments, ZK Passport, reputation, Stellar helpers, feeds, and admin workflows." },
  servers: [{ url: "https://open-stellar.example", description: "Replace with your deployment URL" }],
  tags: [
    { name: "Agents" }, { name: "Protocol" }, { name: "Stellar" }, { name: "Events" }, { name: "Admin" }, { name: "User" }, { name: "Explorer" }, { name: "Prices" },
  ],
  paths: {
    "/api/agents/{id}/messages": { post: op("Agents", "Send a message to an agent", ["id"], { role: "user", content: "Hello" }) },
    "/api/agents/{id}/health": { get: op("Agents", "Read agent health", ["id"]) },
    "/api/agents/{id}/heartbeat": { post: op("Agents", "Record agent heartbeat", ["id"], { status: "active", load: 0.2 }) },
    "/api/agents/{id}/appearance": { get: op("Agents", "Read agent appearance", ["id"]), post: op("Agents", "Update agent appearance", ["id"], { skin: "default", accessories: [] }) },
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
    "/api/feed": { get: op("Events", "List public activity feed") },
    "/api/districts/{districtId}/broadcast": { post: op("Events", "Broadcast a district event", ["districtId"], { message: "Throughput race started" }) },
    "/api/explorer/receipts": { get: op("Explorer", "List payment receipts") },
    "/api/admin/runs": { get: op("Admin", "List orchestration runs"), post: op("Admin", "Create an orchestration run", [], { title: "Research run", steps: [] }) },
    "/api/admin/runs/{runId}": { get: op("Admin", "Read orchestration run", ["runId"]), post: op("Admin", "Update or re-run orchestration run", ["runId"], { action: "rerun" }) },
    "/api/user/export": { get: op("User", "Export user data") },
    "/api/user/delete-request": { post: op("User", "Request user deletion", [], { email: "operator@example.com" }) },
    "/api/prices": { get: op("Prices", "Read token price data") },
  },
}

function op(tag: string, summary: string, params: string[] = [], body?: unknown) {
  return {
    tags: [tag], summary,
    parameters: params.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } })),
    requestBody: body ? { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: true }, examples: { default: { value: body } } } } } : undefined,
    responses: { 200: { description: "Success", content: json }, 400: error, 500: error },
  }
}

export function GET() {
  return NextResponse.json(spec, { headers: { "Cache-Control": "public, max-age=3600" } })
}
