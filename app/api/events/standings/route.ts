import { NextResponse } from "next/server"
import { createAgents } from "@/lib/data"
import { getActiveDistrictEvent, getDistrictStandings } from "@/lib/gamification/events"

export const dynamic = "force-dynamic"

export async function GET() {
  const agents = createAgents()
  return NextResponse.json({ event: getActiveDistrictEvent(), standings: getDistrictStandings(agents) })
}
