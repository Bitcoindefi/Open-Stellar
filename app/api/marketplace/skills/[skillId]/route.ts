import { createApiRouteLogger } from "@/lib/api-logging"
import { deactivateSkill, getSkill } from "@/lib/marketplace/skill-store"

interface RouteContext {
  params: Promise<{ skillId: string }>
}

function getAgentIdFromAuth(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || ""
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim()
    if (token) return token
  }
  const url = new URL(req.url)
  const agentIdParam = url.searchParams.get("agentId")
  if (agentIdParam) return agentIdParam
  return null
}

export async function DELETE(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, "/api/marketplace/skills/[skillId]")

  try {
    const { skillId } = await context.params
    const agentId = getAgentIdFromAuth(req)

    if (!agentId) {
      return await api.json(
        { ok: false, error: "Authentication required to deactivate skill" },
        { status: 401 },
      )
    }

    const existingSkill = getSkill(skillId)
    if (!existingSkill) {
      return await api.json(
        { ok: false, error: "Skill not found" },
        { status: 404 },
      )
    }

    deactivateSkill(skillId, agentId)

    return await api.json({ ok: true, message: "Skill deactivated" })
  } catch (error) {
    const err = error as Error & { statusCode?: number }
    const status = err.statusCode || 500
    return await api.report(
      "warn",
      error,
      { ok: false, error: err.message },
      { status },
    )
  }
}
