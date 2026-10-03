import { MCP_CORS_HEADERS } from "@/lib/mcp/config"
import type { OAuthError } from "@/lib/mcp/oauth"

// Small response helpers shared by the OAuth and MCP route handlers.

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...MCP_CORS_HEADERS, ...extra },
  })
}

export function oauthFailure(error: OAuthError): Response {
  return oauthJson({ error: error.error, error_description: error.error_description }, error.status)
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS })
}

/** Reads an OAuth request body: form-encoded per the spec, JSON accepted too. */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? ""
  const raw = await req.text().catch(() => "")
  if (raw.length > 20_000) return {}
  if (type.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return Object.fromEntries(Object.entries(parsed ?? {}).filter(([, value]) => typeof value === "string")) as Record<string, string>
    } catch {
      return {}
    }
  }
  return Object.fromEntries(new URLSearchParams(raw))
}
