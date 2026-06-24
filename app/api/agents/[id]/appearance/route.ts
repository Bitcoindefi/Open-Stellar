import { Horizon } from "@stellar/stellar-sdk"
import { createApiRouteLogger } from "@/lib/api-logging"
import { getAgentAppearance, setAgentAccessories, setAgentCustomColor, setAgentSkin } from "@/lib/agents/agent-appearance-store"
import { ACCESSORIES, COLOR_CHANGE_COST_XLM, SKINS, isAccessoryUnlockedForBadges, isSkinUnlockedForLevel } from "@/lib/cosmetics"
import { PROTOCOL_TREASURY_ADDRESS, STELLAR_TESTNET_HORIZON } from "@/lib/stellar"
import type { AccessoryId, SkinId } from "@/lib/types"

interface RouteContext {
  params: Promise<{ id: string }>
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

async function verifyTreasuryPayment(txHash: string, minAmount: number): Promise<{ ok: boolean; reason?: string }> {
  if (!/^[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, reason: "Malformed transaction hash" }

  const server = new Horizon.Server(STELLAR_TESTNET_HORIZON)
  try {
    const tx = await server.transactions().transaction(txHash).call()
    if (!tx.successful) return { ok: false, reason: "Transaction was not successful" }

    const ops = await server.operations().forTransaction(txHash).call()
    const paid = ops.records.some((op) => {
      const payment = op as unknown as { type: string; to?: string; asset_type?: string; amount?: string }
      return (
        payment.type === "payment" &&
        payment.to === PROTOCOL_TREASURY_ADDRESS &&
        payment.asset_type === "native" &&
        parseFloat(payment.amount || "0") >= minAmount
      )
    })
    if (!paid) return { ok: false, reason: "Transaction did not pay the treasury the required amount" }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not verify transaction on Horizon" }
  }
}

export async function GET(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, "/api/agents/[id]/appearance")
  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const appearance = getAgentAppearance(agentId)
  return await api.json(
    { ok: true, agentId, appearance, treasuryAddress: PROTOCOL_TREASURY_ADDRESS || null, costXlm: COLOR_CHANGE_COST_XLM },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, "/api/agents/[id]/appearance")
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action

    if (action === "equip-skin") {
      const skinId = body.skinId as SkinId
      const level = Number(body.level)
      if (!SKINS.some((s) => s.id === skinId)) {
        return await api.json({ ok: false, error: "Unknown skin" }, { status: 400 }, { reason: "unknown_skin" })
      }
      if (!Number.isFinite(level) || !isSkinUnlockedForLevel(skinId, level)) {
        return await api.json({ ok: false, error: "Skin not unlocked at reported level" }, { status: 403 }, { reason: "skin_locked" })
      }
      const appearance = setAgentSkin(agentId, skinId)
      return await api.json({ ok: true, agentId, appearance }, undefined, { event: "appearance.skin_equipped", agentId, skinId })
    }

    if (action === "equip-accessories") {
      const accessoryIds = Array.isArray(body.accessoryIds) ? (body.accessoryIds as AccessoryId[]) : []
      const badgeIds = Array.isArray(body.badgeIds) ? (body.badgeIds as string[]) : []

      if (!accessoryIds.every((id) => ACCESSORIES.some((a) => a.id === id))) {
        return await api.json({ ok: false, error: "Unknown accessory" }, { status: 400 }, { reason: "unknown_accessory" })
      }
      const locked = accessoryIds.filter((id) => !isAccessoryUnlockedForBadges(id, badgeIds))
      if (locked.length > 0) {
        return await api.json(
          { ok: false, error: `Accessory not unlocked: ${locked.join(", ")}` },
          { status: 403 },
          { reason: "accessory_locked", locked },
        )
      }
      const appearance = setAgentAccessories(agentId, accessoryIds)
      return await api.json({ ok: true, agentId, appearance }, undefined, { event: "appearance.accessories_equipped", agentId, accessoryIds })
    }

    if (action === "set-color") {
      const color = String(body.color || "")
      const txHash = String(body.txHash || "")
      if (!HEX_COLOR.test(color)) {
        return await api.json({ ok: false, error: "Color must be a 6-digit hex value" }, { status: 400 }, { reason: "invalid_color" })
      }
      if (!PROTOCOL_TREASURY_ADDRESS) {
        return await api.json(
          { ok: false, error: "Treasury address not configured -- set STELLAR_TREASURY_ADDRESS" },
          { status: 503 },
          { reason: "treasury_not_configured" },
        )
      }
      const verification = await verifyTreasuryPayment(txHash, parseFloat(COLOR_CHANGE_COST_XLM))
      if (!verification.ok) {
        return await api.json(
          { ok: false, error: verification.reason || "Payment verification failed" },
          { status: 402 },
          { reason: "payment_verification_failed" },
        )
      }
      const appearance = setAgentCustomColor(agentId, color)
      return await api.json({ ok: true, agentId, appearance }, undefined, { event: "appearance.color_purchased", agentId, color, txHash })
    }

    return await api.json({ ok: false, error: "Unknown action" }, { status: 400 }, { reason: "unknown_action" })
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed updating agent appearance" },
      { status: 400 },
      { reason: "appearance_update_failed" },
    )
  }
}
