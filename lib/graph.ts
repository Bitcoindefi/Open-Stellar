export function hasCycle(adj: Record<string, string[]>): boolean {
  const visited: Record<string, boolean> = {}
  const inStack: Record<string, boolean> = {}

  function dfs(node: string): boolean {
    if (inStack[node]) return true
    if (visited[node]) return false
    visited[node] = true
    inStack[node] = true
    const neighbors = adj[node] ?? []
    for (const n of neighbors) {
      if (dfs(n)) return true
    }
    inStack[node] = false
    return false
  }

  for (const node of Object.keys(adj)) {
    if (!visited[node]) {
      if (dfs(node)) return true
    }
  }

  return false
}
