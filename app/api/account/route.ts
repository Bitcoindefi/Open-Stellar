import { NextResponse } from "next/server"
import { getSessionUser, isGoogleConfigured } from "@/lib/auth/user-auth"
import { readOpenRouterConnection } from "@/lib/connections/openrouter"
import { isSealingConfigured } from "@/lib/connections/sealed-cookie"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// What this browser has connected. Never returns credentials.
export async function GET(req: Request) {
  const openrouter = isSealingConfigured() ? readOpenRouterConnection(req) : null
  return NextResponse.json(
    {
      user: await getSessionUser(req.headers),
      google: { enabled: isGoogleConfigured() && Boolean(process.env.BETTER_AUTH_SECRET) },
      openrouter: { enabled: isSealingConfigured(), connected: Boolean(openrouter), connectedAt: openrouter?.connectedAt ?? null },
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
