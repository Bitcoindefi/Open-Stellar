import { NextResponse } from "next/server"
import { evaluateWithJev, hasJevGatewayConfig, isServerGatewayKeyEnabled, JEV_MODEL, type JevQuestion } from "@/lib/ai/jev"
import { isAuthorized } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function gatewayKeyFromRequest(req: Request): string | undefined {
  const explicit = req.headers.get("x-ai-gateway-key")?.trim()
  if (explicit) return explicit

  const authorization = req.headers.get("authorization")?.trim()
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim()
  }

  return undefined
}

function normalizeQuestions(value: unknown): Record<string, JevQuestion> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, JevQuestion>
  }

  return {
    accepted: {
      type: "boolean",
      instructions: "Does the state satisfy the requested condition?",
    },
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const requestKey = gatewayKeyFromRequest(req)

  return NextResponse.json({
    ok: true,
    model: JEV_MODEL,
    byokRequired: !hasJevGatewayConfig(requestKey),
    serverGatewayEnabled: isServerGatewayKeyEnabled(),
    requestGatewayKeyPresent: Boolean(requestKey),
  }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const state = String(body.state || body.prompt || "")
    if (!state.trim()) {
      return NextResponse.json({ ok: false, error: "state is required" }, { status: 400 })
    }

    const result = await evaluateWithJev({
      state,
      questions: normalizeQuestions(body.questions),
      model: body.model ? String(body.model) : undefined,
    }, { apiKey: gatewayKeyFromRequest(req) })

    return NextResponse.json({ ok: true, model: body.model || JEV_MODEL, result }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "JEV evaluation failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
