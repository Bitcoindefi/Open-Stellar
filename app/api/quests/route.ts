import { NextResponse } from "next/server"

import { getQuests } from "@/lib/gamification/quests"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ quests: getQuests() })
}
