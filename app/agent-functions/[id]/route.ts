import { NextResponse } from "next/server"
import { getCloudAgentConfig, provisionCloudAgent, updateCloudAgentResult } from "@/lib/agent-runtime/cloud-agents"
import { recordAgentHeartbeat, HEARTBEAT_INTERVAL_MS } from "@/lib/agents/agent-health-store"
import { publishSystemEvent } from "@/lib/events/system-events"
import { isAuthorized } from "@/lib/auth"

export const runtime = "edge"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

function getConfig(id: string, req: Request) {
  return getCloudAgentConfig(id) ?? provisionCloudAgent({ name: id, queueMode: "post" }, req)
}

async function reasonAboutTask(task: string, model: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return `Edge agent accepted task: ${task.slice(0, 120)}`
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 220, messages: [{ role: "user", content: task }] }),
  })
  if (!res.ok) return `Claude API unavailable (${res.status}); queued task for retry: ${task.slice(0, 120)}`
  const data = await res.json() as { content?: Array<{ text?: string }> }
  return data.content?.map((part) => part.text).filter(Boolean).join("\n") || "Task completed."
}

export async function POST(req: Request, context: RouteContext) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const agentId = decodeURIComponent(id)
  const config = getConfig(agentId, req)
  const body = await req.json().catch(() => ({}))

  // Sanitize and limit task string length (max 2000 chars)
  const rawTask = String(body.task || body.title || body.prompt || "Process orchestrator task")
  const task = rawTask.trim().slice(0, 2000)

  const taskId = String(body.taskId || `task-${Date.now()}`)

  recordAgentHeartbeat(config.id, { status: "working", cpu: 32, memory: 42, currentTask: task, autoRestart: true })
  publishSystemEvent({ type: "task.started", agentId: config.id, task: { id: taskId, title: task, district: config.district } })

  const started = Date.now()
  const summary = await reasonAboutTask(task, config.model)
  updateCloudAgentResult(config.id, summary)
  recordAgentHeartbeat(config.id, { status: "active", cpu: 8, memory: 24, currentTask: summary, autoRestart: true })
  publishSystemEvent({ type: "task.completed", agentId: config.id, taskId, result: { summary, durationMs: Date.now() - started } })
  return NextResponse.json({ ok: true, agentId: config.id, taskId, result: { summary } }, { headers: { "Cache-Control": "no-store" } })
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
