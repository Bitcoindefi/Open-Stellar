import { NextResponse } from "next/server"
import { BYOK_PROVIDERS, type ByokModelConnection, type ByokProviderId } from "@/lib/ai/byok-provider"
import { isJevModel } from "@/lib/ai/jev"
import { resolveAgentWallet } from "@/lib/agent-wallet/cookie"
import { isStrictSameOrigin, withOAuthCredentials } from "@/lib/connections/hydrate"
import { appendCookies } from "@/lib/connections/sealed-cookie"
import { runChat, type ChatHistoryItem, type ChatRunInput, type ChatTarget } from "@/lib/orchestration/chat-run"
import { createChatRunDeps } from "@/lib/orchestration/deps"
import { encodeEvent, type ChatStreamEvent } from "@/lib/orchestration/events"
import type { RosterAgent } from "@/lib/orchestration/handoff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A run can stream an answer and pay for a few hires (each one a settled x402 task).
export const maxDuration = 120

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

function cleanConnection(connection: ByokModelConnection): ByokModelConnection {
  return { provider: connection.provider as ByokProviderId, model: connection.model.trim(), apiKey: connection.apiKey.trim() }
}

function normalizeMembers(value: unknown): RosterAgent[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return null
  const members: RosterAgent[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const candidate = item as Record<string, unknown>
    if (
      typeof candidate.id !== "string"
      || !candidate.id.trim()
      || typeof candidate.name !== "string"
      || typeof candidate.role !== "string"
      || !validConnection(candidate.connection)
    ) {
      return null
    }
    members.push({
      id: candidate.id.trim().slice(0, 80),
      name: candidate.name.trim().slice(0, 80) || candidate.id.trim().slice(0, 80),
      role: candidate.role.trim().slice(0, 180),
      connection: cleanConnection(candidate.connection),
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

function normalizeApproval(value: unknown): ChatRunInput["approval"] | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.token !== "string" || typeof record.runId !== "string") return null
  if (record.decision !== "approve" && record.decision !== "reject") return null
  return { token: record.token.slice(0, 8192), runId: record.runId.slice(0, 80), decision: record.decision }
}

// Streams the chat as NDJSON (see lib/orchestration/events.ts). Validation errors are plain JSON.
export async function POST(request: Request) {
  const req = await withOAuthCredentials(request)
  if (req instanceof Response) return req
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const approval = body?.approval === undefined ? undefined : normalizeApproval(body.approval)
  if (approval === null) return json({ ok: false, error: "This approval is not valid." }, 400)

  const message = typeof body?.message === "string" ? body.message.trim() : ""
  const target = typeof body?.target === "string" ? body.target as ChatTarget : "orchestrator"
  if (!approval && (!message || message.length > 3000)) return json({ ok: false, error: "Enter a message between 1 and 3000 characters." }, 400)
  if (!body?.orchestrator || typeof body.orchestrator !== "object") return json({ ok: false, error: "Choose an orchestrator model first." }, 400)

  const orchestratorRecord = body.orchestrator as Record<string, unknown>
  if (!validConnection(orchestratorRecord.connection)) return json({ ok: false, error: "The orchestrator needs a connected generative model." }, 400)
  const orchestrator: RosterAgent = {
    id: "orchestrator",
    name: typeof orchestratorRecord.name === "string" ? orchestratorRecord.name.trim().slice(0, 80) || "Orchestrator" : "Orchestrator",
    role: "Coordinate the team and route the user's intent",
    connection: cleanConnection(orchestratorRecord.connection),
  }

  const members = normalizeMembers(body.members)
  if (!members) return json({ ok: false, error: "Configure between 1 and 5 agents with model connections." }, 400)
  if (!approval) {
    if (target !== "orchestrator" && target !== "team" && !target.startsWith("member:")) return json({ ok: false, error: "Unsupported chat target." }, 400)
    if (target.startsWith("member:") && !members.some((member) => `member:${member.id}` === target)) {
      return json({ ok: false, error: "Selected agent is not in the saved team." }, 400)
    }
  }

  const input: ChatRunInput = {
    message,
    target,
    context: typeof body.context === "string" ? body.context.slice(0, 1200) : "Agentic City user chat",
    history: normalizeHistory(body.history),
    orchestrator,
    members,
    ...(approval ? { approval } : {}),
  }
  // The browser's own agents' wallet pays its hires; the first chat creates it (cookie only).
  // Wallet cookies are only used for requests this site made, never for a cross-site post.
  const browser = isStrictSameOrigin(req) ? await resolveAgentWallet(req, { create: true }) : null
  const deps = await createChatRunDeps(req.url, browser ? { uid: browser.uid, wallet: browser.wallet } : { uid: "anonymous", wallet: null })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encodeEvent(event))
        } catch {
          // The browser went away; the run still finishes so any payment is accounted for.
        }
      }
      try {
        await runChat(input, deps, emit)
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "Could not send the chat message." })
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }
    },
  })

  const headers = new Headers({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  })
  if (browser) appendCookies(req, headers, browser.cookies)
  return new Response(stream, { status: 200, headers })
}
