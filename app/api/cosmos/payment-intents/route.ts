import { createApiRouteLogger } from "@/lib/api-logging"
import { createCosmosPayIntent, getCosmosPayNetwork } from "@/lib/cosmospay/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/cosmos/payment-intents")

  try {
    const body = await req.json().catch(() => ({}))
    const intent = await createCosmosPayIntent({
      destination: String(body.destination || body.address || ""),
      amount: String(body.amount || "0.1"),
      assetCode: body.assetCode ? String(body.assetCode) : undefined,
      assetIssuer: body.assetIssuer ? String(body.assetIssuer) : undefined,
      memo: body.memo ? String(body.memo) : undefined,
      msg: body.msg ? String(body.msg) : undefined,
      reference: body.reference ? String(body.reference) : undefined,
    })

    return await api.json(
      { ok: true, provider: "cosmospay", network: getCosmosPayNetwork(), intent },
      undefined,
      { event: "cosmospay.intent.created" },
    )
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed creating CosmosPay intent" },
      { status: 500 },
      { event: "cosmospay.intent.failed" },
    )
  }
}
