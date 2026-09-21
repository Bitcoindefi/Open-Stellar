import { createApiRouteLogger } from "@/lib/api-logging"
import { validateCosmosPayIntent } from "@/lib/cosmospay/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/cosmos/payment-intents/validate")

  try {
    const body = await req.json().catch(() => ({}))
    const outcome = await validateCosmosPayIntent({
      intentId: String(body.intentId || body.id || ""),
      txHash: String(body.txHash || ""),
    })

    return await api.json(
      { ok: true, provider: "cosmospay", outcome },
      undefined,
      { event: "cosmospay.intent.validated", intentId: String(body.intentId || body.id || "") },
    )
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed validating CosmosPay intent" },
      { status: 400 },
      { event: "cosmospay.intent.validation_failed" },
    )
  }
}
