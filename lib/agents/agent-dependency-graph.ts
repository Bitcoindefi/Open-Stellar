import {
  getAgentDependencies,
  getAgentDependents,
} from "@/lib/agent-registry"

export const DEFAULT_MAX_AGENT_GRAPH_DEPTH = 10
export const MAX_AGENT_GRAPH_DEPTH = 10

export interface DependencyTreeNode {
  agentId: string
  depth: number
  dependencies: DependencyTreeNode[]
}

export interface DependentTreeNode {
  agentId: string
  depth: number
  dependents: DependentTreeNode[]
}

export interface AgentDependencyTree {
  agentId: string
  dependencies: DependencyTreeNode[]
  totalCount: number
  maxDepth: number
}

export interface AgentDependentTree {
  agentId: string
  dependents: DependentTreeNode[]
  totalCount: number
  maxDepth: number
}

export type AgentGraphQuery =
  | { flat: boolean; maxDepth: number }
  | { error: "max_depth_exceeded" }

export type GraphDirection = "dependencies" | "dependents"

interface InternalTreeNode {
  agentId: string
  depth: number
  children: InternalTreeNode[]
}

function getNeighbors(agentId: string, direction: GraphDirection): string[] {
  return direction === "dependencies"
    ? getAgentDependencies(agentId)
    : getAgentDependents(agentId)
}

function buildNodes(
  agentId: string,
  direction: GraphDirection,
  depth: number,
  maxDepth: number,
  path: Set<string>,
): InternalTreeNode[] {
  if (depth > maxDepth) return []

  return getNeighbors(agentId, direction).flatMap((neighborId) => {
    if (path.has(neighborId)) return []

    const nextPath = new Set(path)
    nextPath.add(neighborId)

    return [{
      agentId: neighborId,
      depth,
      children: buildNodes(neighborId, direction, depth + 1, maxDepth, nextPath),
    }]
  })
}

function summarize(nodes: InternalTreeNode[]): { totalCount: number; maxDepth: number } {
  let totalCount = 0
  let maxDepth = 0

  const visit = (node: InternalTreeNode): void => {
    totalCount += 1
    maxDepth = Math.max(maxDepth, node.depth)
    node.children.forEach(visit)
  }

  nodes.forEach(visit)
  return { totalCount, maxDepth }
}

function toDependencyNode(node: InternalTreeNode): DependencyTreeNode {
  return {
    agentId: node.agentId,
    depth: node.depth,
    dependencies: node.children.map(toDependencyNode),
  }
}

function toDependentNode(node: InternalTreeNode): DependentTreeNode {
  return {
    agentId: node.agentId,
    depth: node.depth,
    dependents: node.children.map(toDependentNode),
  }
}

export function buildAgentDependencyTree(agentId: string, maxDepth: number): AgentDependencyTree {
  const nodes = buildNodes(agentId, "dependencies", 1, maxDepth, new Set([agentId]))
  const summary = summarize(nodes)

  return {
    agentId,
    dependencies: nodes.map(toDependencyNode),
    ...summary,
  }
}

export function buildAgentDependentTree(agentId: string, maxDepth: number): AgentDependentTree {
  const nodes = buildNodes(agentId, "dependents", 1, maxDepth, new Set([agentId]))
  const summary = summarize(nodes)

  return {
    agentId,
    dependents: nodes.map(toDependentNode),
    ...summary,
  }
}

export function buildAgentGraphTree(
  agentId: string,
  direction: GraphDirection,
  maxDepth: number,
): AgentDependencyTree | AgentDependentTree {
  return direction === "dependencies"
    ? buildAgentDependencyTree(agentId, maxDepth)
    : buildAgentDependentTree(agentId, maxDepth)
}

export function flattenAgentGraph(
  agentId: string,
  direction: GraphDirection,
  maxDepth: number,
): string[] {
  const result: string[] = []
  const seen = new Set([agentId])
  const queue: Array<{ agentId: string; depth: number }> = [{ agentId, depth: 0 }]

  for (const current of queue) {
    if (current.depth >= maxDepth) continue

    for (const neighborId of getNeighbors(current.agentId, direction)) {
      if (seen.has(neighborId)) continue
      seen.add(neighborId)
      result.push(neighborId)
      queue.push({ agentId: neighborId, depth: current.depth + 1 })
    }
  }

  return result
}

export function parseAgentGraphQuery(request: Request): AgentGraphQuery {
  const searchParams = new URL(request.url).searchParams
  const rawMaxDepth = searchParams.get("maxDepth")
  let maxDepth = DEFAULT_MAX_AGENT_GRAPH_DEPTH

  if (rawMaxDepth !== null && /^\d+$/.test(rawMaxDepth)) {
    const parsedMaxDepth = Number(rawMaxDepth)
    if (parsedMaxDepth > MAX_AGENT_GRAPH_DEPTH) {
      return { error: "max_depth_exceeded" }
    }
    maxDepth = parsedMaxDepth
  }

  return {
    flat: searchParams.get("flat") === "true",
    maxDepth,
  }
}
