import { NextResponse } from "next/server"
import { setXPMultiplier, clearXPMultiplier, getXPMultiplierState } from "@/lib/gamification/xp-multiplier"

export const dynamic = "force-dynamic"

function isAdmin(req: Request): boolean {
  const adminKey = req.headers.get("x-admin-key")
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return false
  }
  return true
}

export async function POST(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  try {
    const body = await req.json()
    const multiplier = Number(body.multiplier)
    const durationMs = Number(body.durationMs)
    const reason = String(body.reason || "").trim()

    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) {
      return NextResponse.json(
        { ok: false, error: "multiplier must be between 1 and 10" },
        { status: 400 },
      )
    }

    const maxDurationMs = 7 * 24 * 60 * 60 * 1000
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > maxDurationMs) {
      return NextResponse.json(
        { ok: false, error: "durationMs must be between 0 and 604800000 (7 days)" },
        { status: 400 },
      )
    }

    if (!reason) {
      return NextResponse.json(
        { ok: false, error: "reason is required" },
        { status: 400 },
      )
    }

    const validUntil = Date.now() + durationMs
    setXPMultiplier({ multiplier, validUntil, reason })

    return NextResponse.json(
      { active: true, multiplier, validUntil, reason },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    )
  }
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  clearXPMultiplier()
  return NextResponse.json(
    { ok: true, multiplier: 1 },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  )
}

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const state = getXPMultiplierState()
  return NextResponse.json(
    { active: state !== null, ...(state ? { multiplier: state.multiplier, validUntil: state.validUntil, reason: state.reason } : { multiplier: 1 }) },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  )
}
