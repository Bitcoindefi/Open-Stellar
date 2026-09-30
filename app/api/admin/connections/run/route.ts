import { NextResponse } from "next/server"
import { BYOK_PROVIDERS, generateWithByokProvider, type ByokModelConnection, type ByokProviderId } from "@/lib/ai/byok-provider"
import { isAuthorized } from "@/lib/auth"
import { isJevModel } from "@/lib/ai/jev"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RunMember = { id: string; name: string; role: string; connection: ByokModelConnection }

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function parsePlan(text: string, members: RunMember[]) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const parsed = JSON.parse(normalized) as { tasks?: unknown }
  if (!Array.isArray(parsed.tasks)) throw new Error("The orchestrator did not return a task list. Try again.")

  const memberIds = new Set(members.map((member) => member.id))
  const tasks = parsed.tasks.slice(0, members.length).flatMap((value, index) => {
    if (!value || typeof value !== "object") return []
    const task = value as Record<string, unknown>
    const memberId = typeof task.memberId === "string" && memberIds.has(task.memberId)
      ? task.memberId
      : members[index]?.id
    const title = typeof task.title === "string" ? task.title.trim().slice(0, 120) : ""
    const instructions = typeof task.instructions === "string" ? task.instructions.trim().slice(0, 3000) : ""
    if (!memberId || !instructions) return []
    return [{ memberId, title: title || "Research task", instructions }]
  })
  if (tasks.length === 0) throw new Error("The orchestrator returned no usable work items. Try again.")
  return tasks
}

function validConnection(value: unknown): value is ByokModelConnection {
  if (!value || typeof value !== "object") return false
  const connection = value as Record<string, unknown>
  return typeof connection.provider === "string" && connection.provider in BYOK_PROVIDERS
    && typeof connection.model === "string" && connection.model.trim().length > 0 && connection.model.length <= 180
    && !(connection.provider === "vercel-ai-gateway" && isJevModel(connection.model))
    && typeof connection.apiKey === "string" && connection.apiKey.trim().length >= 8 && connection.apiKey.length <= 8192
}

export async function POST(req: Request) {
  const path = new URL(req.url).pathname
  if (path.startsWith("/api/admin/") && !isAuthorized(req)) return json({ ok: false, error: "Unauthorized" }, 401)

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const mission = typeof body?.mission === "string" ? body.mission.trim() : ""
  if (!mission || mission.length > 3000) return json({ ok: false, error: "Enter a mission between 1 and 3000 characters." }, 400)
  if (!Array.isArray(body?.members) || body.members.length < 1 || body.members.length > 5) {
    return json({ ok: false, error: "A team needs between 1 and 5 worker agents." }, 400)
  }
  if (!body?.orchestrator || typeof body.orchestrator !== "object") return json({ ok: false, error: "Choose an orchestrator model." }, 400)

  const orchestrator = (body.orchestrator as Record<string, unknown>).connection
  if (!validConnection(orchestrator)) return json({ ok: false, error: "The orchestrator needs a connected generative model and API key." }, 400)

  const members = body.members as unknown[]
  const normalizedMembers: RunMember[] = []
  for (let index = 0; index < members.length; index += 1) {
    const value = members[index]
    if (!value || typeof value !== "object") return json({ ok: false, error: `Worker ${index + 1} is invalid.` }, 400)
    const candidate = value as Record<string, unknown>
    if (typeof candidate.id !== "string" || !candidate.id || typeof candidate.name !== "string" || !candidate.name.trim() || typeof candidate.role !== "string" || !candidate.role.trim() || !validConnection(candidate.connection)) {
      return json({ ok: false, error: `Worker ${index + 1} needs a name, role, model, and API key.` }, 400)
    }
    normalizedMembers.push({
      id: candidate.id.slice(0, 80),
      name: candidate.name.trim().slice(0, 80),
      role: candidate.role.trim().slice(0, 160),
      connection: {
        provider: candidate.connection.provider as ByokProviderId,
        model: candidate.connection.model.trim(),
        apiKey: candidate.connection.apiKey.trim(),
      },
    })
  }

  const orchestratorRecord = body.orchestrator as Record<string, unknown>
  const orchestratorName = typeof orchestratorRecord.name === "string" ? orchestratorRecord.name.trim().slice(0, 80) : "Orchestrator"

  try {
    const planText = await generateWithByokProvider(
      { ...orchestrator as ByokModelConnection, apiKey: orchestrator.apiKey.trim() },
      "You are the lead agent of a small AI team. Break the user's mission into one concise, independent work item per worker. Return only valid JSON in this exact shape: {\"tasks\":[{\"memberId\":\"worker id\",\"title\":\"short title\",\"instructions\":\"clear task instructions\"}]}. Use only the supplied worker IDs. Do not claim to have used tools, connected services, changed code, sent messages, or moved funds. Ask workers to analyze and report only.",
      JSON.stringify({ mission, team: normalizedMembers.map(({ id, name, role }) => ({ id, name, role })) }),
    )
    const plan = parsePlan(planText, normalizedMembers)
    const workerResults = await Promise.all(normalizedMembers.map(async (member) => {
      const assigned = plan.filter((task) => task.memberId === member.id)
      if (assigned.length === 0) return { memberId: member.id, name: member.name, role: member.role, model: member.connection.model, status: "skipped", output: "The orchestrator assigned no task to this worker." }
      try {
        const output = await generateWithByokProvider(
          member.connection,
          `You are ${member.name}, a specialist agent acting as ${member.role}. Complete only the analysis assigned to you. Do not claim external actions or tool use. Clearly state assumptions and cite sources only if the user provided them.`,
          JSON.stringify({ mission, tasks: assigned.map(({ title, instructions }) => ({ title, instructions })) }),
        )
        return { memberId: member.id, name: member.name, role: member.role, model: member.connection.model, status: "completed", assigned: assigned.map(({ title }) => title), output }
      } catch (error) {
        return { memberId: member.id, name: member.name, role: member.role, model: member.connection.model, status: "failed", error: error instanceof Error ? error.message : "Worker request failed" }
      }
    }))

    return json({ ok: true, orchestrator: orchestratorName, plan, results: workerResults })
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Could not run the AI team." }, 502)
  }
}
