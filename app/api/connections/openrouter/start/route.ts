import { NextResponse } from "next/server"
import { OPENROUTER_PKCE_COOKIE, OPENROUTER_PKCE_MAX_AGE, buildAuthorizeUrl, cookieOptions, createPkce, safeReturnTo, sealPkce } from "@/lib/connections/openrouter"
import { isSealingConfigured } from "@/lib/connections/sealed-cookie"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  if (!isSealingConfigured()) {
    return NextResponse.json({ ok: false, error: "Connections are not configured on this server." }, { status: 503 })
  }
  const url = new URL(req.url)
  const { verifier, challenge, state } = createPkce()
  const response = NextResponse.redirect(buildAuthorizeUrl(url.origin, challenge, state), 302)
  response.cookies.set(OPENROUTER_PKCE_COOKIE, sealPkce({ verifier, state, returnTo: safeReturnTo(url.searchParams.get("returnTo"), url.origin) }), cookieOptions(req, OPENROUTER_PKCE_MAX_AGE))
  response.headers.set("Cache-Control", "no-store")
  return response
}
