import type { Metadata } from "next"
import { AdminConsole } from "@/components/admin/admin-console"
import { DISTRICTS, createAgents } from "@/lib/data"

export const metadata: Metadata = {
  title: "Agent City Admin",
  description: "Admin portal for gamified AI agent orchestration, API key issuance, wallet rails, and x402 subscription billing.",
}

export default function AdminPage() {
  return <AdminConsole agents={createAgents()} districts={DISTRICTS} />
}
