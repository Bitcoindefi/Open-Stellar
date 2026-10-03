import { readCaps, usdcToMicro, type OrchestratorCaps } from "@/lib/orchestration/budget"

// The remote MCP server of Agentic City: what it is called, where its OAuth endpoints live,
// how long its tokens last and how much an MCP client may spend by default.
// The server is its own OAuth 2.1 authorization server (MCP authorization spec): the AI client
// registers itself (RFC 7591), the person approves it in their browser (their cookies say who
// they are, no account needed) and the client gets short-lived bearer tokens.

export const MCP_PATH = "/api/mcp"
export const MCP_SERVER_NAME = "agentic-city"

export const SCOPES = {
  read: "agents:read",
  hire: "agents:hire",
} as const
export type McpScope = (typeof SCOPES)[keyof typeof SCOPES]
export const ALL_SCOPES: McpScope[] = [SCOPES.read, SCOPES.hire]

export const SCOPE_LABELS: Record<McpScope, string> = {
  "agents:read": "Ver tus agentes, su reputación 8004 y el saldo de la wallet de tus agentes",
  "agents:hire": "Contratar a tus agentes, pagando cada tarea con x402 desde la wallet de tus agentes",
}

export const TTL = {
  /** Authorization codes are single use and short. */
  codeSeconds: 120,
  accessSeconds: 60 * 60,
  refreshSeconds: 30 * 24 * 60 * 60,
  grantSeconds: 30 * 24 * 60 * 60,
  clientSeconds: 180 * 24 * 60 * 60,
  approvalSeconds: 15 * 60,
} as const

export const DEFAULT_GRANT_MAX_USDC_PER_DAY = "0.1"
/** The choices the consent page offers; each one is clamped to the browser's own daily cap. */
export const GRANT_CAP_CHOICES = ["0.05", "0.1", "0.2", "0.5"] as const

export const MAX_GRANTS_PER_BROWSER = 10
export const HIRES_PER_GRANT_PER_MINUTE = 6

/** Cap for one grant: the configured default, never above the browser's daily cap. */
export function defaultGrantCapMicro(env: Record<string, string | undefined> = process.env, caps: OrchestratorCaps = readCaps(env)): number {
  const configured = usdcToMicro(env.MCP_GRANT_MAX_USDC_PER_DAY?.trim() || DEFAULT_GRANT_MAX_USDC_PER_DAY) ?? (usdcToMicro(DEFAULT_GRANT_MAX_USDC_PER_DAY) as number)
  return Math.min(configured, caps.perDayMicro)
}

/** A requested cap in USDC, clamped to (0, browser daily cap]. Falls back to the default. */
export function clampGrantCap(requested: string | null | undefined, env: Record<string, string | undefined> = process.env): number {
  const caps = readCaps(env)
  const micro = requested ? usdcToMicro(requested) : null
  if (micro === null || micro <= 0) return defaultGrantCapMicro(env, caps)
  return Math.min(micro, caps.perDayMicro)
}

/**
 * The public origin of this deployment. MCP_PUBLIC_ORIGIN pins it (useful behind a proxy that
 * rewrites the host); otherwise the request's own origin.
 */
export function publicOrigin(requestUrl: string, env: Record<string, string | undefined> = process.env): string {
  const configured = env.MCP_PUBLIC_ORIGIN?.trim()
  if (configured && /^https?:\/\/[^/]+$/.test(configured.replace(/\/+$/, ""))) return configured.replace(/\/+$/, "")
  return new URL(requestUrl).origin
}

export function resourceUrl(origin: string): string {
  return `${origin}${MCP_PATH}`
}

export function protectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`
}

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Agentic City",
    resource_documentation: `${origin}/docs`,
  }
}

/** RFC 8414 authorization server metadata. Public clients only, PKCE S256 required. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ALL_SCOPES,
    service_documentation: `${origin}/docs`,
  }
}

/** Parses a space-separated scope string. Unknown scopes are dropped; empty means all. */
export function parseScopes(value: string | null | undefined): McpScope[] | null {
  const items = (value ?? "").split(/\s+/).map((item) => item.trim()).filter(Boolean)
  if (items.length === 0) return [...ALL_SCOPES]
  const known = items.filter((item): item is McpScope => (ALL_SCOPES as string[]).includes(item))
  if (known.length === 0) return null
  return ALL_SCOPES.filter((scope) => known.includes(scope))
}

export const MCP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "600",
}
