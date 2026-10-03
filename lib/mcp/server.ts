import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { SCOPES } from "@/lib/mcp/config"
import { hireOverMcp, walletStatus, type McpHireDeps } from "@/lib/mcp/hire"
import type { AuthenticatedGrant } from "@/lib/mcp/oauth"
import { rosterFor } from "@/lib/mcp/roster"
import { microToUsdc } from "@/lib/orchestration/budget"
import type { IdentityStatus } from "@/lib/solana/agent-identity"

// The MCP tools, built per request around one authenticated grant (stateless server: every
// request carries its bearer token, there is no session to keep between serverless instances).
// Every failure comes back as a readable tool result with isError, never as a stack trace.

export type McpToolDeps = McpHireDeps & {
  reputation: (agentId: string, ownerTag: string | null) => Promise<IdentityStatus>
}

function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] }
}

function failure(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }], isError: true }
}

function guarded<A extends unknown[]>(run: (...args: A) => Promise<CallToolResult>): (...args: A) => Promise<CallToolResult> {
  return async (...args: A) => {
    try {
      return await run(...args)
    } catch (error) {
      console.error("[mcp] tool failed:", error instanceof Error ? error.message : error)
      return failure("Something went wrong on the Agentic City server, and nothing was paid. Try again in a moment.")
    }
  }
}

export function createAgenticCityMcpServer(deps: McpToolDeps, auth: AuthenticatedGrant): McpServer {
  const server = new McpServer(
    { name: "agentic-city", version: "1.0.0", title: "Agentic City" },
    {
      instructions:
        "Agentic City lets you hire the person's AI agents. Each hire is a real x402 payment of " +
        `${microToUsdc(deps.priceMicro)} USDC on Solana devnet from the person's agents' wallet, within the daily cap they approved. ` +
        "Call list_agents first, hire only when an agent's role is needed, and show the person the receipt (tx and explorer link).",
    },
  )
  const { grant } = auth
  const roster = rosterFor(grant.team)
  const canRead = auth.scopes.includes(SCOPES.read)
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: true }

  server.registerTool("list_agents", {
    title: "List agents",
    description: "The agents of the person's Agentic City team that this client can hire, with their roles and the price of one hire.",
    annotations: readOnly,
  }, guarded(async () => {
    if (!canRead && !auth.scopes.includes(SCOPES.hire)) return failure("This connection has no scope to see the team.")
    return text(JSON.stringify({
      agents: roster.map((agent) => ({ id: agent.id, name: agent.name, role: agent.role })),
      pricePerHireUsdc: microToUsdc(deps.priceMicro),
      network: "Solana devnet (USDC)",
      paidFrom: grant.address,
    }, null, 2))
  }))

  server.registerTool("get_agent_reputation", {
    title: "Agent reputation (8004)",
    description: "The agent's identity and reputation in the 8004 Agent Registry on Solana devnet: whether it is registered, its asset and the average review score.",
    inputSchema: { agentId: z.string().min(1).max(80).describe("The agent id from list_agents") },
    annotations: readOnly,
  }, guarded(async ({ agentId }: { agentId: string }) => {
    if (!canRead) return failure("This connection was approved without scope agents:read.")
    const agent = roster.find((item) => item.id.toLowerCase() === agentId.trim().toLowerCase())
    const id = agent?.id ?? agentId.trim()
    let status: IdentityStatus
    try {
      status = await deps.reputation(id, deps.ownerTag)
    } catch (error) {
      const message = error instanceof Error && /SOLANA_SERVER_SECRET|not configured/i.test(error.message)
        ? "The 8004 registry is not configured on this server."
        : "The 8004 registry could not be read just now. Try again in a moment."
      return failure(message)
    }
    return text(JSON.stringify({
      agentId: status.agentId,
      name: agent?.name ?? null,
      registered: status.registered,
      asset: status.asset,
      explorerUrl: status.explorerUrl,
      reputation: status.reputation,
      note: status.registered ? undefined : "Not registered in the 8004 registry yet; the person can register it from the Agentic City app.",
    }, null, 2))
  }))

  server.registerTool("hire_agent", {
    title: "Hire an agent",
    description:
      `Hire one agent for a task and get its answer. Pays ${microToUsdc(deps.priceMicro)} USDC with x402 on Solana devnet from the person's agents' wallet and returns the receipt. ` +
      "Over the daily cap nothing is paid: you get a link the person opens to approve, then call again with approvalId.",
    inputSchema: {
      agentId: z.string().min(1).max(80).describe("The agent id from list_agents"),
      task: z.string().min(1).max(2000).describe("What the agent should do, specific and self-contained"),
      approvalId: z.string().max(64).optional().describe("Only after the person approved an over-cap hire in the browser"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, guarded(async ({ agentId, task, approvalId }: { agentId: string; task: string; approvalId?: string }) => {
    const outcome = await hireOverMcp(deps, auth, { agentId, task, approvalId })
    if (!outcome.ok) {
      const body = outcome.receipt
        ? `${outcome.message}\n\nReceipt: ${JSON.stringify({ tx: outcome.receipt.transaction, explorerUrl: outcome.receipt.explorerUrl, amountUsdc: microToUsdc(deps.priceMicro) })}`
        : outcome.message
      return failure(body)
    }
    const receipt = {
      tx: outcome.receipt.transaction,
      explorerUrl: outcome.receipt.explorerUrl,
      amountUsdc: microToUsdc(deps.priceMicro),
      network: outcome.receipt.network,
      payer: outcome.receipt.payer,
    }
    return text(`${outcome.agent.name} answered:\n\n${outcome.answer}\n\nReceipt: ${JSON.stringify(receipt)}`)
  }))

  server.registerTool("wallet_status", {
    title: "Agents' wallet status",
    description: "The person's agents' wallet: address, USDC balance, what this client and the wallet spent today, and the caps.",
    annotations: readOnly,
  }, guarded(async () => {
    if (!canRead) return failure("This connection was approved without scope agents:read.")
    return text(JSON.stringify(await walletStatus(deps, auth), null, 2))
  }))

  return server
}
