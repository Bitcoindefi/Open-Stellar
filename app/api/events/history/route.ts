import { NextResponse } from "next/server"
import { createAgents } from "@/lib/data"
import { getDistrictEventHistory } from "@/lib/gamification/events"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ history: getDistrictEventHistory(createAgents()) })
}
