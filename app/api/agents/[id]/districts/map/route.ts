import { NextResponse } from "next/server"
import { getDistrictUnlockMap } from "@/lib/districts/district-unlock-store"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const result = getDistrictUnlockMap(decodeURIComponent(id))
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
}
