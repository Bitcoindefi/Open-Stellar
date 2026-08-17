import { headers } from "next/headers"
import { forbidden } from "next/navigation"

import { AdminAgentsClient } from "@/components/admin/admin-agents-client"
import { getProvidedAdminToken, hasValidAdminToken } from "@/lib/admin-token"

export default async function AdminAgentsPage() {
  const headerStore = await headers()
  const providedToken = getProvidedAdminToken(headerStore)

  if (!hasValidAdminToken(headerStore) || !providedToken) {
    forbidden()
  }

  return <AdminAgentsClient adminToken={providedToken} />
}
