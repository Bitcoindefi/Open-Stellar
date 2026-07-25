import { NextResponse } from "next/server"
import { getActiveDistrictEvent } from "@/lib/gamification/events"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ event: getActiveDistrictEvent() })
}
