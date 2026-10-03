import { publicOrigin } from "@/lib/mcp/config"
import { oauthFailure, oauthJson, preflight, readParams } from "@/lib/mcp/http"
import { exchangeCode, refreshTokens } from "@/lib/mcp/oauth"
import { getKvStore } from "@/lib/security/kv-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Token endpoint: authorization_code (with PKCE) and refresh_token (rotating). Public clients.
export async function POST(req: Request): Promise<Response> {
  const params = await readParams(req)
  const store = getKvStore()
  try {
    if (params.grant_type === "authorization_code") {
      const result = await exchangeCode(store, {
        code: params.code,
        codeVerifier: params.code_verifier,
        redirectUri: params.redirect_uri,
        clientId: params.client_id,
        resource: params.resource,
      }, publicOrigin(req.url))
      return result.ok ? oauthJson(result.body) : oauthFailure(result)
    }
    if (params.grant_type === "refresh_token") {
      const result = await refreshTokens(store, { refreshToken: params.refresh_token, clientId: params.client_id, scope: params.scope })
      return result.ok ? oauthJson(result.body) : oauthFailure(result)
    }
    return oauthJson({ error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token." }, 400)
  } catch {
    return oauthJson({ error: "temporarily_unavailable", error_description: "The token store is unavailable right now. Try again in a moment." }, 503)
  }
}

export function OPTIONS(): Response {
  return preflight()
}
