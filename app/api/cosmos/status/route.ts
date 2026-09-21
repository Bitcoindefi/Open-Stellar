import { NextResponse } from "next/server"
import { getCosmosPayNetwork } from "@/lib/cosmospay/client"

export const dynamic = "force-dynamic"

export async function GET() {
  const configured = Boolean(process.env.COSMOS_PAY_API_KEY?.trim())
  return NextResponse.json({ ok: true, configured, network: configured ? getCosmosPayNetwork() : "unknown", provider: "cosmospay" }, { headers: { "Cache-Control": "no-store" } })
}
