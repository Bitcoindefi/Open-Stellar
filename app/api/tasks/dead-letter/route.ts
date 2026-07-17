import { NextResponse } from "next/server"
import { listDeadLetterEntries } from "@/lib/agent-runtime/task-queue"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const offset = Number(url.searchParams.get("offset") ?? 0)
  const limit = Number(url.searchParams.get("limit") ?? 50)
  const { entries, total, offset: normalizedOffset, limit: normalizedLimit } = listDeadLetterEntries({ offset, limit })

  return NextResponse.json({
    ok: true,
    tasks: entries,
    pagination: {
      total,
      offset: normalizedOffset,
      limit: normalizedLimit,
    },
  })
}
