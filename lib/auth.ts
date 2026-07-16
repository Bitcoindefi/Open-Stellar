import { getAdminApiKey } from "@/lib/admin-api-key"

/**
 * Authentication utility for Open Stellar API routes.
 * Uses the server-side ADMIN_API_KEY value for bearer authentication.
 */
export function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false
  }

  const bearerToken = authHeader.substring(7)
  return bearerToken === getAdminApiKey()
}
