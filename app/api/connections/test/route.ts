import { POST as testConnection } from "@/app/api/admin/connections/test/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  return testConnection(req)
}
