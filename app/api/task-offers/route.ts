import { NextResponse } from "next/server"
import { apiError } from "@/lib/api/error"
import { listOpenTaskOffers } from "@/lib/task-offers/store"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const capability = url.searchParams.get("cap") ?? undefined
    const offers = listOpenTaskOffers(capability)

    return NextResponse.json(offers, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return apiError(
      "Task offers are temporarily unavailable",
      "TASK_OFFERS_UNAVAILABLE",
      500,
    )
  }
}
