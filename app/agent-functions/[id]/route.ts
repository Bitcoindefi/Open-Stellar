import { NextResponse } from "next/server"
import { getCloudAgentConfig, provisionCloudAgent, updateCloudAgentResult } from "@/lib/agent-runtime/cloud-agents"
import { recordAgentHeartbeat, HEARTBEAT_INTERVAL_MS } from "@/lib/agents/agent-health-store"
import { getAgentHealthSummary, recordAgentExecutionError, recordAgentInvocation } from "@/lib/agents/agent-error-store"
import { publishSystemEvent } from "@/lib/events/system-events"
import { isAuthorized } from "@/lib/auth"
import { isJevModel, summarizeTaskWithJev } from "@/lib/ai/jev"
import { BYOK_PROVIDERS, generateWithByokProvider, type ByokProviderId } from "@/lib/ai/byok-provider"
import { verifyApiKey } from "@/lib/auth/api-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

async function isCloudAgentAuthorized(req: Request): Promise<boolean> {
  if (isAuthorized(req)) return true
  const authorization = req.headers.get("authorization")?.trim() || ""
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : req.headers.get("x-api-key")?.trim() || ""
  if (!token) return false
  const result = await verifyApiKey(token)
  return result.valid && (result.isAdmin || result.scopes.includes("*") || result.scopes.includes("agents:write"))
}

function getConfig(id: string, req: Request) {
  return getCloudAgentConfig(id) ?? provisionCloudAgent({ name: id, queueMode: "post" }, req)
}

async function reasonAboutTask(task: string, model: string, provider: string | null, apiKey: string | null): Promise<string> {
  const effectiveProvider = provider ?? (isJevModel(model) ? "vercel-ai-gateway" : "anthropic")
  if (effectiveProvider === "vercel-ai-gateway" && isJevModel(model)) {
    return summarizeTaskWithJev(task, { apiKey: apiKey ?? undefined })
  }

  if (!(effectiveProvider in BYOK_PROVIDERS)) throw new Error("Unsupported AI provider. Choose Vercel AI Gateway, OpenAI, Anthropic, Groq, or OpenRouter.")
  const key = apiKey ?? (effectiveProvider === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined)
  if (!key) {
    if (!provider) return `Edge agent accepted task: ${task.slice(0, 120)}`
    throw new Error("Send the provider's key in the x-ai-api-key header.")
  }
  return generateWithByokProvider({ provider: effectiveProvider as ByokProviderId, model, apiKey: key }, "You are a focused AI agent. Complete the user's task and state any assumptions. Do not claim external actions or tool use.", task)
}

export async function POST(req: Request, context: RouteContext) {
  if (!(await isCloudAgentAuthorized(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const config = getConfig(agentId, req)
  const body = await req.json().catch(() => ({}))
  const provider = req.headers.get("x-ai-provider")?.trim().toLowerCase() || config.provider || null
  const apiKey = req.headers.get("x-ai-api-key")?.trim() || req.headers.get("x-ai-gateway-key")?.trim() || null
  const model = req.headers.get("x-ai-model")?.trim() || config.model

  if (apiKey && !provider && !req.headers.get("x-ai-gateway-key")) {
    return NextResponse.json({ ok: false, error: "Send x-ai-provider with x-ai-api-key." }, { status: 400, headers: { "Cache-Control": "no-store" } })
  }

  // Sanitize and limit task string length (max 2000 chars)
  const rawTask = String(body.task || body.title || body.prompt || "Process orchestrator task")
  const task = rawTask.trim().slice(0, 2000)

  const taskId = String(body.taskId || `task-${Date.now()}`)

  const health = getAgentHealthSummary(config.id)
  if (health.degraded) console.warn(`[agent-health] Invoking degraded cloud agent ${config.id}`)
  recordAgentInvocation(config.id)
  recordAgentHeartbeat(config.id, { status: health.degraded ? "degraded" : "working", cpu: 32, memory: 42, currentTask: task, autoRestart: true })
  publishSystemEvent({ type: "task.started", agentId: config.id, task: { id: taskId, title: task, district: config.district } })

  const started = Date.now()
  try {
    const summary = await reasonAboutTask(task, model, provider, apiKey)
    updateCloudAgentResult(config.id, summary)
    recordAgentHeartbeat(config.id, { status: getAgentHealthSummary(config.id).degraded ? "degraded" : "active", cpu: 8, memory: 24, currentTask: summary, autoRestart: true })
    publishSystemEvent({ type: "task.completed", agentId: config.id, taskId, result: { summary, durationMs: Date.now() - started } })

    return NextResponse.json({ ok: true, agentId: config.id, taskId, result: { summary } }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const failure = recordAgentExecutionError({ agentId: config.id, error, taskExcerpt: task })
    recordAgentHeartbeat(config.id, { status: failure.degraded ? "degraded" : "error", cpu: 8, memory: 24, currentTask: task, autoRestart: true })
    const summary = error instanceof Error ? error.message : "Agent execution failed"
    publishSystemEvent({ type: "task.completed", agentId: config.id, taskId, result: { summary, durationMs: Date.now() - started } })
    return NextResponse.json({ ok: false, agentId: config.id, taskId, error: summary, degraded: failure.degraded }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  const config = getConfig(decodeURIComponent(id), req)
  const encoder = new TextEncoder()
  let interval: ReturnType<typeof setInterval>
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        const health = recordAgentHeartbeat(config.id, { status: "active", cpu: 6, memory: 20, currentTask: "SSE heartbeat", autoRestart: true })
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ ok: true, config, health })}\n\n`))
      }
      send()
      interval = setInterval(send, HEARTBEAT_INTERVAL_MS)
    },
    cancel() {
      clearInterval(interval)
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } })
}
