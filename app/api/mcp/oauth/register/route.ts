import { oauthFailure, oauthJson, preflight } from "@/lib/mcp/http"
import { registerClient } from "@/lib/mcp/oauth"
import { getKvStore } from "@/lib/security/kv-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// RFC 7591 dynamic client registration. Open, as the MCP spec expects: a registration grants
// nothing by itself; the person still has to approve the client in their browser.
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text().catch(() => "")
  if (raw.length > 10_000) return oauthJson({ error: "invalid_client_metadata", error_description: "The client metadata is too large." }, 400)
  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch {
    return oauthJson({ error: "invalid_client_metadata", error_description: "Send the client metadata as JSON." }, 400)
  }
  try {
    const result = await registerClient(getKvStore(), body)
    if (!result.ok) return oauthFailure(result)
    return oauthJson(result.client, 201)
  } catch {
    return oauthJson({ error: "temporarily_unavailable", error_description: "Registration is unavailable right now. Try again in a moment." }, 503)
  }
}

export function OPTIONS(): Response {
  return preflight()
}
