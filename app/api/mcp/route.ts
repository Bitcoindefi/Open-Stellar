import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { MCP_CORS_HEADERS, protectedResourceMetadataUrl, publicOrigin, ALL_SCOPES } from "@/lib/mcp/config"
import { createMcpDeps } from "@/lib/mcp/deps"
import { preflight } from "@/lib/mcp/http"
import { authenticateAccessToken, bearerToken } from "@/lib/mcp/oauth"
import { createAgenticCityMcpServer } from "@/lib/mcp/server"
import { getKvStore } from "@/lib/security/kv-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A hire pays (x402 settle) and runs the agent's model.
export const maxDuration = 120

// The remote MCP endpoint (Streamable HTTP, stateless, JSON responses). Every request needs a
// bearer token from this server's OAuth flow; without one the client gets a 401 pointing to the
// protected resource metadata, which is how MCP clients discover where to log in.

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) headers.set(key, value)
  headers.set("Cache-Control", "no-store")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function unauthorized(req: Request, description: string, hadToken: boolean): Response {
  const origin = publicOrigin(req.url)
  const params = [`resource_metadata="${protectedResourceMetadataUrl(origin)}"`, `scope="${ALL_SCOPES.join(" ")}"`]
  if (hadToken) params.unshift(`error="invalid_token"`, `error_description="${description.replace(/"/g, "'")}"`)
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: `Unauthorized: ${description}` }, id: null }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer ${params.join(", ")}`, ...MCP_CORS_HEADERS },
  })
}

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: this server is stateless, use POST." }, id: null }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", ...MCP_CORS_HEADERS },
  })
}

export async function POST(req: Request): Promise<Response> {
  const token = bearerToken(req)
  const store = getKvStore()
  let auth: Awaited<ReturnType<typeof authenticateAccessToken>>
  try {
    auth = await authenticateAccessToken(store, token, publicOrigin(req.url))
  } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "The token store is unavailable right now. Try again in a moment." }, id: null }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Retry-After": "5", ...MCP_CORS_HEADERS },
    })
  }
  if (!auth.ok) return unauthorized(req, auth.description, Boolean(token))

  const value = auth.value
  try {
    const server = createAgenticCityMcpServer(createMcpDeps(req.url, value.grant.uid), value)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    const response = await transport.handleRequest(req)
    return withCors(response)
  } finally {
    value.dataKey.fill(0)
  }
}

export async function GET(req: Request): Promise<Response> {
  // Without a token, answer like POST so a client probing with GET still discovers the login.
  if (!bearerToken(req)) return unauthorized(req, "Missing access token.", false)
  return methodNotAllowed()
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed()
}

export async function OPTIONS(): Promise<Response> {
  return preflight()
}
