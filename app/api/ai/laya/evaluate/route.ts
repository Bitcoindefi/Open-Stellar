import { NextResponse } from "next/server"
import { evaluateWithLaya, isLayaConfigured } from "@/lib/ai/laya"
import { isAuthorized } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ ok: true, configured: isLayaConfigured(), engine: "laya", localOnly: true }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const state = String(body.state || body.prompt || "").trim()
    if (!state) return NextResponse.json({ ok: false, error: "state is required" }, { status: 400 })
    const result = await evaluateWithLaya({ state, questions: body.questions || {}, lang: body.lang })
    return NextResponse.json({ ok: true, engine: "laya", result }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Laya evaluation failed" }, { status: 503 })
  }
}
