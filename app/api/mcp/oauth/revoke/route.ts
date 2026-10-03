import { oauthJson, preflight, readParams } from "@/lib/mcp/http"
import { revokeToken } from "@/lib/mcp/oauth"
import { getKvStore } from "@/lib/security/kv-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// RFC 7009: always 200 for a well-formed request, whether or not the token existed.
export async function POST(req: Request): Promise<Response> {
  const params = await readParams(req)
  if (!params.token) return oauthJson({ error: "invalid_request", error_description: "Send the token to revoke." }, 400)
  try {
    await revokeToken(getKvStore(), params.token)
  } catch {
    return oauthJson({ error: "temporarily_unavailable", error_description: "Try again in a moment." }, 503)
  }
  return oauthJson({})
}

export function OPTIONS(): Response {
  return preflight()
}
