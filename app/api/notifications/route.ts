import { NextResponse } from "next/server"

import {
  getUnreadNotificationCount,
  listUnseenNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications/notification-store"

export const dynamic = "force-dynamic"

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 20)
  if (!Number.isFinite(parsed)) return 20
  return Math.max(1, Math.min(50, Math.floor(parsed)))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get("agentId")?.trim()

  if (!agentId) {
    return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 })
  }

  const notifications = listUnseenNotifications(agentId, {
    since: searchParams.get("since"),
    limit: parseLimit(searchParams.get("limit")),
  })

  return NextResponse.json({
    ok: true,
    agentId,
    notifications,
    unreadCount: getUnreadNotificationCount(agentId),
    nextCursor: notifications[0]?.cursor ?? searchParams.get("since") ?? null,
  })
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const contentType = req.headers.get("content-type") ?? ""
    const body = contentType.includes("application/json") ? await req.json() : {}
    const agentId = String(body.agentId ?? searchParams.get("agentId") ?? "").trim()

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 })
    }

    const markedRead = markAllNotificationsRead(agentId)
    return NextResponse.json({ ok: true, agentId, markedRead, unreadCount: getUnreadNotificationCount(agentId) })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed marking notifications read" },
      { status: 500 },
    )
  }
}
