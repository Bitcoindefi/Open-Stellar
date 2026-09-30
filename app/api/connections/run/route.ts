import { POST as runTeam } from "@/app/api/admin/connections/run/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  return runTeam(req)
}
