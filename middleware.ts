import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  checkRateLimit,
  heartbeatRateLimit,
  protocolRateLimit,
  defaultApiRateLimit,
} from "@/lib/rate-limit"

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  const ip = getClientIp(req)

  let limit: { allowed: boolean; retryAfterSeconds: number } | null = null

  if (path.startsWith("/api/agents/") && path.endsWith("/heartbeat")) {
    limit = checkRateLimit(`heartbeat:${ip}`, heartbeatRateLimit)
  } else if (path.startsWith("/api/protocol/")) {
    limit = checkRateLimit(`protocol:${ip}`, protocolRateLimit)
  } else if (path.startsWith("/api/")) {
    limit = checkRateLimit(`api:${ip}`, defaultApiRateLimit)
  }

  if (limit && !limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limit_exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
