import { authorizationServerMetadata, publicOrigin } from "@/lib/mcp/config"
import { oauthJson, preflight } from "@/lib/mcp/http"

export const dynamic = "force-dynamic"

// RFC 8414 authorization server metadata for the MCP OAuth flow.
export function GET(req: Request): Response {
  return oauthJson(authorizationServerMetadata(publicOrigin(req.url)), 200, { "Cache-Control": "public, max-age=300" })
}

export function OPTIONS(): Response {
  return preflight()
}
