import { NextResponse } from "next/server"
import { hasJevGatewayConfig, isServerGatewayKeyEnabled, JEV_MODEL } from "@/lib/ai/jev"
import { isLayaConfigured } from "@/lib/ai/laya"

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
      layaConfigured: isLayaConfigured(),
      layaEngine: "local-sidecar",
      decisionPolicy: "Laya first for typed decisions; JEV BYOK fallback for remote evaluation",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
