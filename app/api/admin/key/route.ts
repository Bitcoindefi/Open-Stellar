import { NextResponse } from "next/server"
import { getAdminApiKey } from "@/lib/admin-api-key"
import { isAuthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json(
    { ok: true, key: getAdminApiKey() },
    { headers: { "Cache-Control": "no-store" } },
  )
}
