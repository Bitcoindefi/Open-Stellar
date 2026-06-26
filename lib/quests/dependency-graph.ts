import type { SubTask } from "@/lib/gamification/quests"

/**
 * Detect if adding a dependency edge from -> to would create a cycle.
 *
 * Uses DFS from the target node. If any path from `to` leads back to `from`,
 * the proposed edge would close a cycle.
 *
 * Also returns the cycle path as an array of subtask IDs.
 */
export function hasCycle(
  subtasks: SubTask[],
  fromId: string,
  toId: string,
): { hasCycle: boolean; cycle: string[] } {
  // Build adjacency map from existing dependsOn edges
  const adjacency = new Map<string, string[]>()
  for (const st of subtasks) {
    adjacency.set(st.id, st.dependsOn ?? [])
  }

  // Temporarily add the proposed edge (from -> to)
  const existing = adjacency.get(fromId) ?? []
  if (!existing.includes(toId)) {
    adjacency.set(fromId, [...existing, toId])
  }

  // DFS from toId looking for a path back to fromId
  // Use path-specific visited (recursion stack) to detect cycles
  function dfs(nodeId: string, path: string[], visitedInPath: Set<string>): string[] | null {
    if (nodeId === fromId) {
      return [...path, nodeId]
    }
    if (visitedInPath.has(nodeId)) return null

    visitedInPath.add(nodeId)
    path.push(nodeId)

    const neighbors = adjacency.get(nodeId) ?? []
    for (const neighbor of neighbors) {
      const cycle = dfs(neighbor, path, visitedInPath)
      if (cycle) return cycle
    }

    path.pop()
    visitedInPath.delete(nodeId)
    return null
  }

  const cyclePath = dfs(toId, [], new Set())

  if (cyclePath) {
    return { hasCycle: true, cycle: cyclePath }
  }

  return { hasCycle: false, cycle: [] }
}
