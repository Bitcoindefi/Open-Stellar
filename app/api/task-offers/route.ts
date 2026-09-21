import { NextResponse } from "next/server"
import { apiError } from "@/lib/api/error"
import { listOpenTaskOffers, toPublicTaskOffer } from "@/lib/task-offers/store"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const requiredCapability = url.searchParams.get("cap")?.trim() || undefined
    const offers = listOpenTaskOffers({ requiredCapability }).map(toPublicTaskOffer)

    return NextResponse.json(
      { ok: true, offers },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to load task offers",
      "TASK_OFFERS_UNAVAILABLE",
      500,
    )
  }
}
