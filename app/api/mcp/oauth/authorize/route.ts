import { resolveAgentWallet } from "@/lib/agent-wallet/cookie"
import { isStrictSameOrigin } from "@/lib/connections/hydrate"
import { appendCookies } from "@/lib/connections/sealed-cookie"
import { clampGrantCap, publicOrigin } from "@/lib/mcp/config"
import { readParams } from "@/lib/mcp/http"
import { approveAuthorization, checkAuthorizeRequest, errorRedirect, successRedirect } from "@/lib/mcp/oauth"
import { normalizeTeam } from "@/lib/mcp/roster"
import { getKvStore } from "@/lib/security/kv-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// The person's decision on the consent page (/mcp/authorize). Only this site's own page may
// post here: the browser's cookies are what identify the person and their agents' wallet.

function page(message: string, status: number): Response {
  const safe = message.replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[char] as string)
  return new Response(`<!doctype html><meta charset="utf-8"><title>Agentic City</title><body style="font-family:system-ui;background:#050a12;color:#e2e8f0;padding:2rem"><p>${safe}</p></body>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" },
  })
}

function redirect(location: string, cookies?: { req: Request; list: Parameters<typeof appendCookies>[2] }): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" })
  if (cookies) appendCookies(cookies.req, headers, cookies.list)
  return new Response(null, { status: 303, headers })
}

export async function POST(req: Request): Promise<Response> {
  if (!isStrictSameOrigin(req)) return page("Esta aprobación tiene que hacerse desde la página de Agentic City.", 403)
  const form = await readParams(req)
  const origin = publicOrigin(req.url)
  const store = getKvStore()
  const params = new URLSearchParams()
  for (const name of ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"]) {
    if (typeof form[name] === "string" && form[name] !== "") params.set(name, form[name])
  }

  let check: Awaited<ReturnType<typeof checkAuthorizeRequest>>
  try {
    check = await checkAuthorizeRequest(store, params, origin)
  } catch {
    return page("No pudimos verificar el pedido en este momento. Probá de nuevo.", 503)
  }
  if (!check.ok) return check.redirect ? redirect(check.redirect) : page(check.description, 400)
  const { request, client } = check

  if (form.decision !== "approve") {
    return redirect(errorRedirect(request.redirectUri, "access_denied", "The person denied access.", request.state, origin))
  }

  const browser = await resolveAgentWallet(req, { create: true })
  if (!browser?.wallet) return page("Las wallets de agentes no están configuradas en este servidor.", 503)

  let team: unknown = []
  try {
    team = JSON.parse(form.team || "[]")
  } catch {
    team = []
  }

  try {
    const { code } = await approveAuthorization(store, {
      request,
      client,
      uid: browser.uid,
      wallet: browser.wallet,
      capMicro: clampGrantCap(form.cap),
      team: normalizeTeam(team),
    })
    return redirect(successRedirect(request.redirectUri, code, request.state, origin), { req, list: browser.cookies })
  } catch {
    return page("No pudimos guardar la aprobación en este momento. Probá de nuevo.", 503)
  }
}
