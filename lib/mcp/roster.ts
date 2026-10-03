import { BYOK_PROVIDERS, type ByokModelConnection, type ByokProviderId } from "@/lib/ai/byok-provider"

// Which agents an MCP client can hire. The person's team lives in their browser (localStorage,
// with their model keys), and an MCP request carries no browser state, so the consent page
// sends a snapshot of the team's names and roles (never its keys) and the grant keeps it.
// Without a team, a small default roster stands in. Either way, an agent hired over MCP answers
// with the server's hosted model (MCP_AGENT_MODEL), so the AI client needs no model key either.

export type McpAgent = { id: string; name: string; role: string }

export const DEFAULT_ROSTER: McpAgent[] = [
  { id: "researcher", name: "Investigadora", role: "Research a topic and report the evidence, with sources when it has them" },
  { id: "analyst", name: "Analista", role: "Analyze options, numbers and risks, and give a reasoned recommendation" },
  { id: "writer", name: "Redactor", role: "Write clear copy, summaries and short documents in Spanish or English" },
]

const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/
const MAX_TEAM = 5

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/** A team snapshot from the consent page: ids, names and roles only. Invalid entries are dropped. */
export function normalizeTeam(value: unknown): McpAgent[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const team: McpAgent[] = []
  for (const item of value.slice(0, MAX_TEAM * 2)) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const id = clean(record.id, 80)
    if (!AGENT_ID.test(id) || seen.has(id.toLowerCase())) continue
    seen.add(id.toLowerCase())
    team.push({ id, name: clean(record.name, 60) || id, role: clean(record.role, 180) || "General assistant" })
    if (team.length >= MAX_TEAM) break
  }
  return team
}

export function rosterFor(team: McpAgent[] | null | undefined): McpAgent[] {
  return team && team.length > 0 ? team : DEFAULT_ROSTER
}

export function findAgent(roster: McpAgent[], wanted: string): McpAgent | null {
  const lowered = wanted.trim().toLowerCase()
  if (!lowered) return null
  return roster.find((agent) => agent.id.toLowerCase() === lowered)
    ?? roster.find((agent) => agent.name.toLowerCase() === lowered)
    ?? null
}

export const DEFAULT_HOSTED_MODEL = "openai/gpt-4o-mini"

/**
 * The model that answers hires made over MCP. MCP_AGENT_PROVIDER (default vercel-ai-gateway),
 * MCP_AGENT_MODEL (default openai/gpt-4o-mini) and MCP_AGENT_API_KEY, which falls back to
 * AI_GATEWAY_API_KEY for the gateway. Null when no key is configured: hiring is then off.
 */
export function hostedConnection(env: Record<string, string | undefined> = process.env): ByokModelConnection | null {
  const provider = (env.MCP_AGENT_PROVIDER?.trim() || "vercel-ai-gateway") as ByokProviderId
  if (!(provider in BYOK_PROVIDERS)) return null
  const model = env.MCP_AGENT_MODEL?.trim() || DEFAULT_HOSTED_MODEL
  const apiKey = env.MCP_AGENT_API_KEY?.trim() || (provider === "vercel-ai-gateway" ? env.AI_GATEWAY_API_KEY?.trim() : "") || ""
  if (apiKey.length < 8) return null
  return { provider, model, apiKey }
}
