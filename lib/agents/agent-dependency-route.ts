import { NextResponse } from "next/server"

import { getRegisteredAgent } from "@/lib/agent-registry"
import {
  buildAgentGraphTree,
  flattenAgentGraph,
  parseAgentGraphQuery,
  type GraphDirection,
} from "@/lib/agents/agent-dependency-graph"

interface RouteContext {
  params: Promise<{ id: string }>
}

export function createAgentGraphHandler(direction: GraphDirection) {
  return async function GET(request: Request, context: RouteContext) {
    const { id } = await context.params
    const agentId = decodeURIComponent(id)

    if (!getRegisteredAgent(agentId)) {
      return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
    }

    const query = parseAgentGraphQuery(request)
    if ("error" in query) {
      return NextResponse.json({ error: query.error }, { status: 400 })
    }

    const body = query.flat
      ? { agentId, [direction]: flattenAgentGraph(agentId, direction, query.maxDepth) }
      : buildAgentGraphTree(agentId, direction, query.maxDepth)

    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
  }
}
