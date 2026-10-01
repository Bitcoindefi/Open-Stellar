import { NextResponse } from "next/server"
import { OPENROUTER_COOKIE, cookieOptions, readOpenRouterConnection } from "@/lib/connections/openrouter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const connection = readOpenRouterConnection(req)
  return NextResponse.json(
    { connected: Boolean(connection), connectedAt: connection?.connectedAt ?? null },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function DELETE(req: Request) {
  const response = NextResponse.json({ ok: true, connected: false }, { headers: { "Cache-Control": "no-store" } })
  response.cookies.set(OPENROUTER_COOKIE, "", cookieOptions(req, 0))
  return response
}
