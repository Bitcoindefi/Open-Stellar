/**
 * Authentication utility for Open Stellar API routes.
 * Uses the MOLTBOT_GATEWAY_TOKEN for bearer authentication.
 */

export function isAuthorized(req: Request): boolean {
  const token = process.env.MOLTBOT_GATEWAY_TOKEN
  if (!token) {
    // If no token is configured, we allow it in development but this should be set in prod.
    // Based on the user's security concern, we should probably require it.
    // However, looking at other routes (like cron), they allow if secret is missing.
    // Given the "security concern" framing, I will require it if it's expected.
    return false
  }

  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false
  }

  const bearerToken = authHeader.substring(7)
  return bearerToken === token
}

/**
 * Authorization utility for cron jobs.
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}
