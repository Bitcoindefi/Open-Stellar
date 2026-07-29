import { createApiRouteLogger } from "@/lib/api-logging"
import { listSkills, registerSkill } from "@/lib/marketplace/skill-store"

function getAgentIdFromAuth(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || ""
  if (!authHeader.startsWith("Bearer ")) return null
  const token = authHeader.substring(7).trim()
  return token || null
}

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, "/api/marketplace/skills")

  try {
    const url = new URL(req.url)
    const name = url.searchParams.get("name") || undefined
    const agentId = url.searchParams.get("agentId") || undefined
    const maxPriceXLMStr = url.searchParams.get("maxPriceXLM")
    const maxPriceXLM = maxPriceXLMStr !== null ? Number(maxPriceXLMStr) : undefined

    const skills = listSkills({ name, agentId, maxPriceXLM })
    return await api.json({ ok: true, skills }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return await api.report(
      "error",
      error,
      { ok: false, error: error instanceof Error ? error.message : "Failed to list skills" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/marketplace/skills")

  try {
    const body = await req.json().catch(() => ({}))
    const authAgentId = getAgentIdFromAuth(req)
    const agentId = authAgentId || (body.agentId ? String(body.agentId) : "")

    if (!agentId) {
      return await api.json(
        { ok: false, error: "Agent authentication required (Bearer token or agentId in body)" },
        { status: 401 },
      )
    }

    const skill = registerSkill({
      agentId,
      name: String(body.name || ""),
      description: String(body.description || ""),
      priceXLM: Number(body.priceXLM),
      callUrl: String(body.callUrl || ""),
    })

    return await api.json({ ok: true, skill }, { status: 201 })
  } catch (error) {
    const err = error as Error & { statusCode?: number }
    const status = err.statusCode || (err.message.includes("required") || err.message.includes("must be") || err.message.includes("valid URL") ? 400 : 500)
    return await api.report(
      "warn",
      error,
      { ok: false, error: err.message },
      { status },
    )
  }
}
