import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { isIpBlocked } from "@/lib/auth/blocklist"
import { apiKeyTier, enforceDdosLimit, limitForTier, rateLimit } from "@/lib/auth/rate-limit"

const ALLOWLISTED_USER_AGENTS = [/vercel/i, /vercelbot/i, /uptime/i, /health/i]
const INTERNAL_HEALTH_PATHS = ["/api/cron/health-check"]
const SENSITIVE_CLI_BLOCK_PATHS = [
  "/api/protocol/x402/quote",
  "/api/protocol/x402/settle",
  "/api/protocol/passport/authorize",
]
const CLI_USER_AGENT_PATTERN = /\b(curl|wget|httpie|python-requests|go-http-client)\b/i

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  )
}

function getApiKey(req: NextRequest): string | null {
  const headerKey = req.headers.get("x-api-key")?.trim()
  if (headerKey) return headerKey

  const authorization = req.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null
  return authorization.slice("Bearer ".length).trim() || null
}

function isAllowlisted(req: NextRequest): boolean {
  const userAgent = req.headers.get("user-agent") ?? ""
  if (INTERNAL_HEALTH_PATHS.includes(req.nextUrl.pathname)) return true
  return ALLOWLISTED_USER_AGENTS.some((pattern) => pattern.test(userAgent))
}

function rateLimitResponse(limit: number, remaining: number, resetAt: number, retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limit_exceeded", retryAfter: retryAfterSeconds },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    },
  )
}

function blockResponse(error: string, status: number = 403): NextResponse {
  return NextResponse.json({ error }, { status })
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname
  const ip = getClientIp(req)

  if (isAllowlisted(req)) return NextResponse.next()

  const userAgent = req.headers.get("user-agent")
  if (!userAgent) return blockResponse("missing_user_agent")

  if (SENSITIVE_CLI_BLOCK_PATHS.includes(path) && CLI_USER_AGENT_PATTERN.test(userAgent)) {
    console.warn("bot_request_blocked", { ip, path, userAgent })
    return blockResponse("bot_detected")
  }

  const blockStatus = await isIpBlocked(ip)
  if (blockStatus.blocked) {
    const retryAfterSeconds = Math.max(1, Math.ceil((blockStatus.resetAt - Date.now()) / 1000))
    return rateLimitResponse(0, 0, blockStatus.resetAt, retryAfterSeconds)
  }

  const ddosResult = await enforceDdosLimit(ip, path)
  if (!ddosResult.allowed) {
    return rateLimitResponse(ddosResult.limit, ddosResult.remaining, ddosResult.resetAt, ddosResult.retryAfterSeconds)
  }

  const apiKey = getApiKey(req)
  const tier = apiKeyTier(apiKey)
  const routeLimit = limitForTier(path, tier)
  if (!routeLimit) return NextResponse.next()

  const identifier = apiKey ? `key:${apiKey}` : `ip:${ip}`
  const limitResult = await rateLimit(identifier, path, routeLimit)
  if (!limitResult.allowed) {
    return rateLimitResponse(
      limitResult.limit,
      limitResult.remaining,
      limitResult.resetAt,
      limitResult.retryAfterSeconds,
    )
  }

  const response = NextResponse.next()
  response.headers.set("X-RateLimit-Limit", String(limitResult.limit))
  response.headers.set("X-RateLimit-Remaining", String(limitResult.remaining))
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(limitResult.resetAt / 1000)))
  return response
}

export const config = {
  matcher: "/api/:path*",
}
