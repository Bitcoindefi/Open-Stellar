import { GET as rootGet, OPTIONS as rootOptions } from "@/app/.well-known/oauth-protected-resource/route"

export const dynamic = "force-dynamic"

// RFC 9728 path form: /.well-known/oauth-protected-resource/api/mcp for the resource /api/mcp.
export function GET(req: Request): Response {
  return rootGet(req)
}

export function OPTIONS(): Response {
  return rootOptions()
}
