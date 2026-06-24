import { NextResponse } from "next/server"
import {
  broadcastDistrictMessage,
  isAgentMessageType,
  isDistrictId,
  listDistrictMessages,
} from "@/lib/agent-runtime/messaging"

export const dynamic = "force-dynamic"

type BroadcastRouteContext = {
  params: Promise<{ districtId: string }>
}

export async function GET(_req: Request, context: BroadcastRouteContext) {
  const { districtId } = await context.params

  if (!isDistrictId(districtId)) {
    return NextResponse.json({ ok: false, error: "Unknown district" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, districtId, messages: listDistrictMessages(districtId) })
}

export async function POST(req: Request, context: BroadcastRouteContext) {
  const { districtId } = await context.params
  const body = await req.json()
  const type = body.type

  if (!isDistrictId(districtId)) {
    return NextResponse.json({ ok: false, error: "Unknown district" }, { status: 404 })
  }

  if (!isAgentMessageType(type)) {
    return NextResponse.json({ ok: false, error: "Unsupported message type" }, { status: 400 })
  }

  try {
    const message = broadcastDistrictMessage(districtId, {
      fromAgentId: String(body.fromAgentId || ""),
      type,
      payload: body.payload ?? {},
      replyTo: body.replyTo ? String(body.replyTo) : undefined,
      expiresAt: body.expiresAt ? String(body.expiresAt) : undefined,
    })

    return NextResponse.json({ ok: true, message }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed broadcasting message" },
      { status: 400 },
    )
  }
}
