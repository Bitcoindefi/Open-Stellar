import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  checkTierRateLimit,
  verifyApiKey,
  type ApiKeyTier,
  type VerificationResult,
} from './api-keys'

export interface AuthEvaluationResult {
  allowed: boolean
  status: number
  error?: string
  tier: ApiKeyTier
  scopes: string[]
  isAdmin: boolean
  headers?: Record<string, string>
}

/**
 * Extracts API key from Authorization header or URL search parameters.
 */
export function extractApiKey(req: Request | NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/)
    if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
      return parts[1]
    }
  }

  try {
    const url = new URL(req.url)
    const queryKey = url.searchParams.get('apiKey')
    if (queryKey) {
      return queryKey.trim()
    }
  } catch {
    // Ignore URL parse error
  }

  return null
}

/**
 * Extracts client IP address for rate limiting unauthenticated callers.
 */
export function getClientIp(req: Request | NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.headers.get('x-real-ip') || '127.0.0.1'
}

/**
 * Checks if a path is a static asset or Next.js internal.
 */
export function isStaticOrInternalPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/public') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/manifest.json' ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff|woff2|ttf|eot)$/i.test(pathname)
  )
}

/**
 * Evaluates whether an API or Admin request is authorized.
 */
export async function evaluateAuth(req: Request | NextRequest): Promise<AuthEvaluationResult> {
  const url = new URL(req.url)
  const pathname = url.pathname
  const method = req.method.toUpperCase()
  const apiKey = extractApiKey(req)
  const clientIp = getClientIp(req)

  // 1. Verify key if provided
  let authResult: VerificationResult = {
    valid: false,
    tier: 'no_key',
    scopes: [],
    isAdmin: false,
  }

  if (apiKey) {
    authResult = await verifyApiKey(apiKey)
    if (!authResult.valid) {
      return {
        allowed: false,
        status: 401,
        error: 'Unauthorized: Invalid or revoked API key',
        tier: 'no_key',
        scopes: [],
        isAdmin: false,
      }
    }
  }

  // 2. Admin routes: /admin, /admin/*, /api/admin, /api/admin/*
  const isAdminRoute =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/')

  if (isAdminRoute) {
    if (!apiKey) {
      return {
        allowed: false,
        status: 401,
        error: 'Unauthorized: Admin API key required',
        tier: 'no_key',
        scopes: [],
        isAdmin: false,
      }
    }

    if (!authResult.isAdmin) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Admin access required',
        tier: authResult.tier,
        scopes: authResult.scopes,
        isAdmin: false,
      }
    }

    return {
      allowed: true,
      status: 200,
      tier: 'admin',
      scopes: authResult.scopes,
      isAdmin: true,
    }
  }

  // 3. Write operations on /api/agents (Agent registration / updates)
  const isAgentWriteRoute =
    (pathname === '/api/agents' || pathname.startsWith('/api/agents/')) &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  if (isAgentWriteRoute) {
    if (!apiKey) {
      return {
        allowed: false,
        status: 401,
        error: 'Unauthorized: API key required for agent write operations',
        tier: 'no_key',
        scopes: [],
        isAdmin: false,
      }
    }

    const hasWriteScope =
      authResult.isAdmin ||
      authResult.scopes.includes('*') ||
      authResult.scopes.includes('agents:write')

    if (!hasWriteScope) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Missing required scope agents:write',
        tier: authResult.tier,
        scopes: authResult.scopes,
        isAdmin: false,
      }
    }
  }

  // 4. Rate Limiting enforcement
  const rateLimitIdentifier = authResult.valid && authResult.record?.id
    ? authResult.record.id
    : clientIp

  const rateLimitStatus = checkTierRateLimit(rateLimitIdentifier, authResult.tier)
  if (!rateLimitStatus.allowed) {
    return {
      allowed: false,
      status: 429,
      error: 'rate_limit_exceeded',
      tier: authResult.tier,
      scopes: authResult.scopes,
      isAdmin: authResult.isAdmin,
      headers: {
        'Retry-After': String(rateLimitStatus.retryAfterSeconds),
      },
    }
  }

  return {
    allowed: true,
    status: 200,
    tier: authResult.tier,
    scopes: authResult.scopes,
    isAdmin: authResult.isAdmin,
  }
}

/**
 * Standard Next.js middleware handler for auth & rate limiting.
 */
export async function authMiddleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname

  if (isStaticOrInternalPath(pathname)) {
    return NextResponse.next()
  }

  const result = await evaluateAuth(req)

  if (!result.allowed) {
    // If it's a browser page request under /admin (not /api/), return 401 response or JSON
    const isHtmlRoute = !pathname.startsWith('/api/')
    if (isHtmlRoute && result.status === 401) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: result.error || 'Unauthorized' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...(result.headers || {}),
          },
        },
      )
    }

    return NextResponse.json(
      { ok: false, error: result.error || 'Unauthorized' },
      {
        status: result.status,
        headers: result.headers,
      },
    )
  }

  const response = NextResponse.next()
  if (result.tier) {
    response.headers.set('X-Api-Tier', result.tier)
  }
  return response
}
