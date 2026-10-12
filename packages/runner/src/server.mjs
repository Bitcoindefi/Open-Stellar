// The runner's HTTP API on 127.0.0.1. GET /status, POST /run and POST /orchestrate; the last two
// answer with Server-Sent Events so the web app can show progress while the CLIs work.

import http from "node:http"
import { AGENT_ORDER, agentLabel, isValidModel } from "./agents.mjs"
import { orchestrate } from "./orchestrate.mjs"
import { isAllowedHost, isAllowedOrigin, readBearer, tokensMatch } from "./security.mjs"

export const DEFAULT_PORT = 7421
export const MAX_BODY_BYTES = 64 * 1024
export const MAX_PROMPT_CHARS = 20_000
const MAX_ACTIVE_STREAMS = 2
const HEARTBEAT_MS = 15_000

function sendJson(res, status, body) {
  if (res.headersSent) return
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  res.end(JSON.stringify(body))
}

function setCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
  res.setHeader("Access-Control-Max-Age", "600")
}

function readJson(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    let size = 0
    let tooBig = false
    const chunks = []
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > limit) {
        tooBig = true
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (tooBig) return resolve({ ok: false, status: 413, error: "body_too_large" })
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")
        if (!value || typeof value !== "object" || Array.isArray(value)) return resolve({ ok: false, status: 400, error: "invalid_json" })
        resolve({ ok: true, value })
      } catch {
        resolve({ ok: false, status: 400, error: "invalid_json" })
      }
    })
    req.on("error", () => resolve({ ok: false, status: 400, error: "invalid_body" }))
  })
}

function openEventStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  res.flushHeaders?.()
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n")
  }, HEARTBEAT_MS)
  heartbeat.unref?.()
  return {
    send(event) {
      if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`)
    },
    end() {
      clearInterval(heartbeat)
      if (!res.writableEnded) res.end()
    },
  }
}

/** What /status exposes per agent: no paths, no account details. */
export function publicAgent(agent) {
  return {
    id: agent.id,
    label: agent.label,
    installed: Boolean(agent.installed),
    version: agent.version ?? null,
    loggedIn: agent.loggedIn ?? null,
    ...(agent.detail ? { detail: agent.detail } : {}),
    ...(agent.loginHint ? { loginHint: agent.loginHint } : {}),
    ...(Array.isArray(agent.models) ? { models: agent.models.slice(0, 20) } : {}),
  }
}

export function validateRunBody(body) {
  const agent = typeof body.agent === "string" ? body.agent : ""
  if (!AGENT_ORDER.includes(agent)) return { ok: false, error: "unknown_agent" }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!prompt) return { ok: false, error: "empty_prompt" }
  if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: "prompt_too_long" }
  if (body.model !== undefined && body.model !== null && !isValidModel(body.model)) return { ok: false, error: "invalid_model" }
  return { ok: true, value: { agent, prompt, model: body.model ?? undefined } }
}

export function validateOrchestrateBody(body) {
  const task = typeof body.task === "string" ? body.task.trim() : ""
  if (!task) return { ok: false, error: "empty_task" }
  if (task.length > MAX_PROMPT_CHARS) return { ok: false, error: "task_too_long" }
  let agents
  if (body.agents !== undefined) {
    if (!Array.isArray(body.agents) || body.agents.some((id) => !AGENT_ORDER.includes(id))) return { ok: false, error: "unknown_agent" }
    agents = body.agents
  }
  let orchestrator
  if (body.orchestrator !== undefined && body.orchestrator !== null) {
    if (!AGENT_ORDER.includes(body.orchestrator)) return { ok: false, error: "unknown_agent" }
    orchestrator = body.orchestrator
  }
  return { ok: true, value: { task, agents, orchestrator } }
}

/**
 * @param {{
 *   token: string,
 *   port: number | (() => number),
 *   extraOrigins?: string[],
 *   runtime: { status: (o?: { probe?: boolean }) => Promise<any[]>, usableAgents: () => Promise<string[]>, run: Function },
 *   version: string,
 *   orchestrateImpl?: typeof orchestrate,
 *   maxActive?: number,
 *   log?: (line: string) => void,
 * }} options
 */
export function createRunnerHandler({ token, port, extraOrigins = [], runtime, version, orchestrateImpl = orchestrate, maxActive = MAX_ACTIVE_STREAMS, log = () => {} }) {
  const portOf = typeof port === "function" ? port : () => port
  const controllers = new Set()

  const stream = async (req, res, label, work) => {
    if (controllers.size >= maxActive) {
      sendJson(res, 429, { error: "busy", message: "El runner ya está trabajando en otras tareas. Esperá a que terminen." })
      return
    }
    const controller = new AbortController()
    controllers.add(controller)
    const events = openEventStream(res)
    let finished = false
    res.on("close", () => {
      if (!finished) controller.abort()
    })
    log(label)
    try {
      await work(events.send, controller.signal)
    } catch (error) {
      events.send({ type: "error", message: error instanceof Error ? error.message : "Error inesperado en el runner." })
    } finally {
      finished = true
      controllers.delete(controller)
      events.end()
    }
  }

  const handler = async (req, res) => {
    const origin = req.headers.origin
    if (!isAllowedHost(req.headers.host, portOf())) return sendJson(res, 403, { error: "host_not_allowed" })
    if (origin !== undefined) {
      if (!isAllowedOrigin(origin, extraOrigins)) return sendJson(res, 403, { error: "origin_not_allowed" })
      setCors(res, origin)
    }

    if (req.method === "OPTIONS") {
      if (origin === undefined) return sendJson(res, 400, { error: "missing_origin" })
      // Chrome's Private Network Access preflight for a public page calling localhost.
      if (String(req.headers["access-control-request-private-network"]).toLowerCase() === "true") {
        res.setHeader("Access-Control-Allow-Private-Network", "true")
      }
      res.writeHead(204)
      res.end()
      return
    }

    if (!tokensMatch(token, readBearer(req.headers.authorization))) return sendJson(res, 401, { error: "unauthorized" })

    const url = new URL(req.url || "/", "http://127.0.0.1")
    if (req.method === "GET" && url.pathname === "/status") {
      const agents = await runtime.status({ probe: url.searchParams.get("probe") === "1" })
      return sendJson(res, 200, {
        ok: true,
        runner: { name: "agentic-city-runner", version, platform: process.platform },
        agents: agents.map(publicAgent),
      })
    }

    if (req.method === "POST" && (url.pathname === "/run" || url.pathname === "/orchestrate")) {
      if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        return sendJson(res, 415, { error: "json_required" })
      }
      const body = await readJson(req)
      if (!body.ok) return sendJson(res, body.status, { error: body.error })

      if (url.pathname === "/run") {
        const check = validateRunBody(body.value)
        if (!check.ok) return sendJson(res, 400, { error: check.error })
        const { agent, prompt, model } = check.value
        return stream(req, res, `/run -> ${agentLabel(agent)} (${prompt.length} caracteres)`, async (send, signal) => {
          send({ type: "start", agent, label: agentLabel(agent) })
          const result = await runtime.run(agent, prompt, { model, signal, onChunk: (text) => send({ type: "chunk", agent, text }) })
          if (signal.aborted) return
          if (result.ok) send({ type: "done", agent, label: agentLabel(agent), text: result.text, ms: result.durationMs, truncated: result.truncated })
          else send({ type: "error", agent, label: agentLabel(agent), message: result.error })
        })
      }

      const check = validateOrchestrateBody(body.value)
      if (!check.ok) return sendJson(res, 400, { error: check.error })
      const { task, agents, orchestrator } = check.value
      return stream(req, res, `/orchestrate (${task.length} caracteres)`, async (send, signal) => {
        const available = await runtime.usableAgents()
        await orchestrateImpl({
          task,
          agents,
          orchestrator,
          available,
          signal,
          emit: send,
          runAgent: (agentId, prompt, options) => runtime.run(agentId, prompt, options),
        })
      })
    }

    return sendJson(res, 404, { error: "not_found" })
  }

  return {
    handler,
    abortAll() {
      controllers.forEach((controller) => controller.abort())
    },
    get active() {
      return controllers.size
    },
  }
}

/** Starts the HTTP server on 127.0.0.1 only. */
export function createRunnerServer(options) {
  let boundPort = options.port ?? DEFAULT_PORT
  const api = createRunnerHandler({ ...options, port: () => boundPort })
  const server = http.createServer((req, res) => {
    api.handler(req, res).catch(() => sendJson(res, 500, { error: "internal_error" }))
  })
  // Long CLI runs keep the SSE response open; do not let Node time it out.
  server.requestTimeout = 0
  server.headersTimeout = 30_000

  return {
    server,
    api,
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(boundPort, "127.0.0.1", () => {
          server.off("error", reject)
          const address = server.address()
          boundPort = typeof address === "object" && address ? address.port : boundPort
          resolve({ port: boundPort })
        })
      })
    },
    close() {
      api.abortAll()
      return new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections?.()
      })
    },
  }
}
