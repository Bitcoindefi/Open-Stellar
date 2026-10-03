import { protectedResourceMetadata, publicOrigin } from "@/lib/mcp/config"
import { oauthJson, preflight } from "@/lib/mcp/http"

export const dynamic = "force-dynamic"

// RFC 9728 metadata for the MCP endpoint (root form; the path form lives under /api/mcp).
export function GET(req: Request): Response {
  return oauthJson(protectedResourceMetadata(publicOrigin(req.url)), 200, { "Cache-Control": "public, max-age=300" })
}

export function OPTIONS(): Response {
  return preflight()
}
