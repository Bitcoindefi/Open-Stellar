import { getAdminApiKey, timingSafeEqual } from './auth/api-keys'

/**
 * Authentication utility for Open Stellar API routes.
 * Validates Bearer token against MOLTBOT_GATEWAY_TOKEN or ADMIN_API_KEY using constant-time comparison.
 */
export function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false
  }

  const bearerToken = authHeader.substring(7).trim()
  if (!bearerToken) {
    return false
  }

  // 1. Check MOLTBOT_GATEWAY_TOKEN
  const gatewayToken = process.env.MOLTBOT_GATEWAY_TOKEN
  if (gatewayToken && timingSafeEqual(bearerToken, gatewayToken)) {
    return true
  }

  // 2. Check ADMIN_API_KEY
  try {
    const adminKey = getAdminApiKey()
    if (adminKey && timingSafeEqual(bearerToken, adminKey)) {
      return true
    }
  } catch {
    // Ignore if not set in dev
  }

  return false
}
