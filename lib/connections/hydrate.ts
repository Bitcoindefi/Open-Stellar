import { NextResponse } from "next/server"
import { readOpenRouterConnection } from "@/lib/connections/openrouter"

// Model connections created with a login ("auth": "oauth") carry no key in the browser.
// Before a request reaches a BYOK route, fill in the key from the encrypted cookie.

type Json = Record<string, unknown>

function needsOAuthKey(value: unknown): value is Json {
  return Boolean(value && typeof value === "object" && (value as Json).auth === "oauth")
}

export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site"
  try {
    return new URL(origin).host === new URL(req.url).host
  } catch {
    return false
  }
}

function deny(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function withOAuthCredentials(req: Request): Promise<Request | Response> {
  const text = await req.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return new Request(req.url, { method: req.method, headers: req.headers, body: text })
  }
  if (!body || typeof body !== "object") return new Request(req.url, { method: req.method, headers: req.headers, body: text })

  const record = body as Json
  const targets: Json[] = []
  if (needsOAuthKey(record)) targets.push(record)
  for (const holder of [record.orchestrator, record.agent] as Array<Json | undefined>) {
    if (holder && typeof holder === "object" && needsOAuthKey(holder.connection)) targets.push(holder.connection as Json)
  }
  if (Array.isArray(record.members)) {
    for (const member of record.members) {
      if (member && typeof member === "object" && needsOAuthKey((member as Json).connection)) targets.push((member as Json).connection as Json)
    }
  }

  if (targets.length > 0) {
    // The key comes from a cookie, so only accept requests made by this site.
    if (!isSameOrigin(req)) return deny("Cross-site requests cannot use your connected accounts.", 403)
    const openrouter = readOpenRouterConnection(req)
    for (const target of targets) {
      if (target.provider !== "openrouter") return deny("Only OpenRouter connections can be used with a login for now.", 400)
      if (!openrouter) return deny("Connect OpenRouter first.", 401)
      target.apiKey = openrouter.key
      delete target.auth
    }
  }

  return new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(record) })
}
