import { NextResponse } from "next/server"
import {
  OPENROUTER_COOKIE,
  OPENROUTER_COOKIE_MAX_AGE,
  OPENROUTER_PKCE_COOKIE,
  cookieOptions,
  exchangeCode,
  readPkce,
} from "@/lib/connections/openrouter"
import { seal } from "@/lib/connections/sealed-cookie"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function back(req: Request, returnTo: string, status: string) {
  const target = new URL(returnTo, new URL(req.url).origin)
  target.searchParams.set("openrouter", status)
  const response = NextResponse.redirect(target, 302)
  response.cookies.set(OPENROUTER_PKCE_COOKIE, "", cookieOptions(req, 0))
  response.headers.set("Cache-Control", "no-store")
  return response
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const pkce = readPkce(req)
  const code = url.searchParams.get("code")
  if (!pkce || !code || url.searchParams.get("state") !== pkce.state) return back(req, pkce?.returnTo ?? "/", "error")

  try {
    const key = await exchangeCode(code, pkce.verifier)
    const response = back(req, pkce.returnTo, "connected")
    response.cookies.set(OPENROUTER_COOKIE, seal({ key, connectedAt: new Date().toISOString() }), cookieOptions(req, OPENROUTER_COOKIE_MAX_AGE))
    return response
  } catch {
    return back(req, pkce.returnTo, "error")
  }
}
