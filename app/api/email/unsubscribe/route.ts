import { NextResponse } from "next/server"
import { unsubscribeEmail, verifyUnsubscribeToken } from "@/lib/email/resend"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const email = url.searchParams.get("email") || ""
  const token = url.searchParams.get("token") || ""

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ ok: false, error: "Invalid unsubscribe link" }, { status: 400 })
  }

  unsubscribeEmail(email)

  return new NextResponse(
    `<!doctype html><html><body style="font-family: Arial, sans-serif"><h1>Unsubscribed</h1><p>${email} will no longer receive Open Stellar email notifications.</p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  )
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; token?: string }

  if (!body.email || !body.token || !verifyUnsubscribeToken(body.email, body.token)) {
    return NextResponse.json({ ok: false, error: "Invalid unsubscribe request" }, { status: 400 })
  }

  const preferences = unsubscribeEmail(body.email)
  return NextResponse.json({ ok: true, preferences }, { headers: { "Cache-Control": "no-store" } })
}
