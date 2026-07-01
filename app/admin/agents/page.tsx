import { headers } from "next/headers"
import { forbidden } from "next/navigation"

import { AdminAgentsClient } from "@/components/admin/admin-agents-client"

export default async function AdminAgentsPage() {
  const headerStore = await headers()
  const providedToken =
    headerStore.get("ADMIN_TOKEN") ??
    headerStore.get("admin_token") ??
    headerStore.get("x-admin-token") ??
    headerStore.get("admin-token")
  const expectedToken = process.env.ADMIN_TOKEN

  if (!expectedToken || providedToken !== expectedToken) {
    forbidden()
  }

  return <AdminAgentsClient />
}
