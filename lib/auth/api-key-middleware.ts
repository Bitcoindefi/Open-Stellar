import { NextResponse } from 'next/server'
import { getAdminApiKey } from '@/lib/admin-api-key'

export type ApiKeyType = 'admin' | 'protocol' | 'any'

export interface ApiKeyAuthOptions {
  /**
   * The type of API key to accept
   * - 'admin': Only accepts admin API keys
   * - 'protocol': Only accepts protocol API keys
   * - 'any': Accepts both admin and protocol API keys
   */
  keyType?: ApiKeyType
  
  /**
   * Custom error message for unauthorized requests
   */
  errorMessage?: string
  
  /**
   * Whether to allow requests in development mode without authentication
   */
  allowDevMode?: boolean
}

/**
 * Validates an API key from the request
 */
export function validateApiKey(req: Request, options: ApiKeyAuthOptions = {}): { valid: boolean; keyType?: string } {
  const { keyType = 'any', allowDevMode = false } = options
  
  // Allow in development mode if configured
  if (allowDevMode && process.env.NODE_ENV === 'development') {
    return { valid: true, keyType: 'dev' }
  }
  
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return { valid: false }
  }
  
  // Support both Bearer and API-Key header formats
  let apiKey: string | null = null
  
  if (authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7)
  } else if (authHeader.startsWith('API-Key ')) {
    apiKey = authHeader.substring(8)
  } else if (authHeader.startsWith('X-API-Key ')) {
    apiKey = authHeader.substring(10)
  } else {
    // Try to use the entire header as the key
    apiKey = authHeader
  }
  
  if (!apiKey) {
    return { valid: false }
  }
  
  // Check admin API key
  const adminKey = getAdminApiKey()
  if (adminKey && apiKey === adminKey) {
    if (keyType === 'protocol') {
      return { valid: false } // Admin key not allowed for protocol-only routes
    }
    return { valid: true, keyType: 'admin' }
  }
  
  // Check protocol API key (MOLTBOT_GATEWAY_TOKEN)
  const protocolKey = process.env.MOLTBOT_GATEWAY_TOKEN
  if (protocolKey && apiKey === protocolKey) {
    if (keyType === 'admin') {
      return { valid: false } // Protocol key not allowed for admin-only routes
    }
    return { valid: true, keyType: 'protocol' }
  }
  
  return { valid: false }
}

/**
 * API key authentication middleware for Next.js API routes
 * Returns a NextResponse if unauthorized, null if authorized
 */
export function withApiKeyAuth(
  handler: (req: Request, ...args: any[]) => Promise<Response> | Response,
  options: ApiKeyAuthOptions = {}
) {
  return async (req: Request, ...args: any[]): Promise<Response> => {
    const validation = validateApiKey(req, options)
    
    if (!validation.valid) {
      const errorMessage = options.errorMessage || 'Unauthorized: Invalid or missing API key'
      return NextResponse.json(
        { ok: false, error: errorMessage },
        { 
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer realm="API", API-Key realm="API"',
          },
        }
      )
    }
    
    // Add key type to request headers for downstream use
    const authenticatedReq = new Request(req.url, {
      ...req,
      headers: new Headers(req.headers),
    })
    authenticatedReq.headers.set('x-api-key-type', validation.keyType || 'unknown')
    
    return handler(authenticatedReq, ...args)
  }
}

/**
 * Higher-order function to wrap route handlers with API key authentication
 * Usage: export const GET = withApiKeyAuth(async (req) => { ... }, { keyType: 'admin' })
 */
export function createApiKeyAuthRoute(
  handler: (req: Request, ...args: any[]) => Promise<Response> | Response,
  options: ApiKeyAuthOptions = {}
) {
  return withApiKeyAuth(handler, options)
}

/**
 * Check if a request is authenticated (for use within route handlers)
 */
export function isAuthenticated(req: Request): boolean {
  return validateApiKey(req).valid
}

/**
 * Get the type of API key used for authentication
 */
export function getApiKeyType(req: Request): string | null {
  const authHeader = req.headers.get('x-api-key-type')
  if (authHeader) {
    return authHeader
  }
  
  const validation = validateApiKey(req)
  return validation.valid ? (validation.keyType || null) : null
}
