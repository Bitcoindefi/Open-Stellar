import { NextResponse } from "next/server"
import { hasJevGatewayConfig, isServerGatewayKeyEnabled, JEV_MODEL } from "@/lib/ai/jev"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const serverGatewayEnabled = isServerGatewayKeyEnabled()
  const serverGatewayConfigured = serverGatewayEnabled && hasJevGatewayConfig()

  return NextResponse.json(
    {
      ok: true,
      model: JEV_MODEL,
      byokRequired: !serverGatewayConfigured,
      serverGatewayEnabled,
      serverGatewayConfigured,
      userKeyHeader: "x-ai-gateway-key",
      authorizationFormat: "Authorization: Bearer <user-ai-gateway-key>",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}