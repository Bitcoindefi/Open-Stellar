import { NextResponse } from "next/server"
import { BYOK_PROVIDERS, generateWithByokProvider, type ByokModelConnection, type ByokProviderId } from "@/lib/ai/byok-provider"
import { isJevModel } from "@/lib/ai/jev"
import { withOAuthCredentials } from "@/lib/connections/hydrate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChatTarget = "orchestrator" | "team" | `member:${string}`

type ChatMember = {
  id: string
  name: string
  role: string
  connection: ByokModelConnection
}

type ChatHistoryItem = {
  speaker: string
  message: string
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function validConnection(value: unknown): value is ByokModelConnection {
  if (!value || typeof value !== "object") return false
  const connection = value as Record<string, unknown>
  return typeof connection.provider === "string" && connection.provider in BYOK_PROVIDERS
    && typeof connection.model === "string" && connection.model.trim().length > 0 && connection.model.length <= 180
    && !(connection.provider === "vercel-ai-gateway" && isJevModel(connection.model))
    && typeof connection.apiKey === "string" && connection.apiKey.trim().length >= 8 && connection.apiKey.length <= 8192
}

function normalizeMembers(value: unknown): ChatMember[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return null
  const members: ChatMember[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const candidate = item as Record<string, unknown>
    if (
      typeof candidate.id !== "string"
      || typeof candidate.name !== "string"
      || typeof candidate.role !== "string"
      || !validConnection(candidate.connection)
    ) {
      return null
    }
    members.push({
      id: candidate.id.slice(0, 80),
      name: candidate.name.trim().slice(0, 80),
      role: candidate.role.trim().slice(0, 180),
      connection: {
        provider: candidate.connection.provider as ByokProviderId,
        model: candidate.connection.model.trim(),
        apiKey: candidate.connection.apiKey.trim(),
      },
    })
  }
  return members
}

function normalizeHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(-12).flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const candidate = item as Record<string, unknown>
    if (typeof candidate.speaker !== "string" || typeof candidate.message !== "string") return []
    return [{ speaker: candidate.speaker.slice(0, 80), message: candidate.message.slice(0, 1200) }]
  })
}

async function askAgent(agent: ChatMember, message: string, history: ChatHistoryItem[], context: string) {
  const output = await generateWithByokProvider(
    agent.connection,
    `You are ${agent.name}, an AI agent in Agentic City. Your role is: ${agent.role}. Answer the user's latest message as this agent. Stay concise, practical, and honest about limits. Do not claim tool use, blockchain actions, connector actions, payments, messages, or code changes unless the user explicitly provides evidence that they happened. If the user asks for work that requires tools, describe the next step or ask for permission in product language.`,
    JSON.stringify({ context, conversation: history, latestUserMessage: message }),
  )
  return { id: agent.id, name: agent.name, role: agent.role, model: agent.connection.model, message: output }
}

export async function POST(request: Request) {
  const req = await withOAuthCredentials(request)
  if (req instanceof Response) return req
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  const target = typeof body?.target === "string" ? body.target as ChatTarget : "orchestrator"
  if (!message || message.length > 3000) return json({ ok: false, error: "Enter a message between 1 and 3000 characters." }, 400)
  if (!body?.orchestrator || typeof body.orchestrator !== "object") return json({ ok: false, error: "Choose an orchestrator model first." }, 400)

  const orchestratorRecord = body.orchestrator as Record<string, unknown>
  if (!validConnection(orchestratorRecord.connection)) return json({ ok: false, error: "The orchestrator needs a connected generative model." }, 400)
  const orchestrator: ChatMember = {
    id: "orchestrator",
    name: typeof orchestratorRecord.name === "string" ? orchestratorRecord.name.trim().slice(0, 80) || "Orchestrator" : "Orchestrator",
    role: "Coordinate the team and route the user's intent",
    connection: {
      provider: orchestratorRecord.connection.provider as ByokProviderId,
      model: orchestratorRecord.connection.model.trim(),
      apiKey: orchestratorRecord.connection.apiKey.trim(),
    },
  }

  const members = normalizeMembers(body.members)
  if (!members) return json({ ok: false, error: "Configure between 1 and 5 agents with model connections." }, 400)
  const history = normalizeHistory(body.history)
  const context = typeof body.context === "string" ? body.context.slice(0, 1200) : "Agentic City user chat"

  try {
    if (target === "orchestrator") {
      const response = await askAgent(orchestrator, message, history, `${context}. Team: ${members.map((member) => `${member.name}: ${member.role}`).join("; ")}`)
      return json({ ok: true, responses: [response] })
    }

    if (target.startsWith("member:")) {
      const memberId = target.slice("member:".length)
      const member = members.find((item) => item.id === memberId)
      if (!member) return json({ ok: false, error: "Selected agent is not in the saved team." }, 400)
      const response = await askAgent(member, message, history, `${context}. The user addressed this agent directly.`)
      return json({ ok: true, responses: [response] })
    }

    if (target === "team") {
      const coordinator = await askAgent(orchestrator, message, history, `${context}. First reply as the orchestrator with a compact routing note, then the workers will answer.`)
      const workerResponses = await Promise.all(members.map((member) => askAgent(member, message, [...history, { speaker: coordinator.name, message: coordinator.message }], `${context}. Reply from your specialty after reading the orchestrator note.`)))
      return json({ ok: true, responses: [coordinator, ...workerResponses] })
    }

    return json({ ok: false, error: "Unsupported chat target." }, 400)
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Could not send the chat message." }, 502)
  }
}
