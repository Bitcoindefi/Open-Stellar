// Browser-side client for the local runner. Every call goes straight from the browser to
// 127.0.0.1; nothing here runs on (or passes through) the Vercel server.

import type { RunnerPairing } from "@/lib/runner/pairing"
import type { RunnerEvent } from "@/lib/runner/events"

export type RunnerAgentId = "claude" | "codex" | "gemini" | "ollama"

export type RunnerAgent = {
  id: RunnerAgentId
  label: string
  installed: boolean
  version: string | null
  loggedIn: boolean | null
  detail?: string
  loginHint?: string
  models?: string[]
}

export type RunnerStatus =
  | { state: "unpaired" }
  | { state: "checking" }
  | { state: "offline" }
  | { state: "unauthorized" }
  | { state: "error"; message: string }
  | { state: "ready"; version: string; agents: RunnerAgent[] }

type FetchLike = typeof fetch

const STATUS_TIMEOUT_MS = 4_000
const PROBE_TIMEOUT_MS = 45_000

export function runnerBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

export class RunnerRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "RunnerRequestError"
    this.status = status
  }
}

export function offlineMessage(port: number): string {
  return `No encontramos el runner en 127.0.0.1:${port}. Volvé a correr el comando de Modelos IA > Conectá tu PC y probá de nuevo.`
}

export function messageForStatus(status: number, body: { error?: string; message?: string } | null): string {
  if (status === 401) return "El runner no reconoce este navegador (se reinició y cambió la clave). Abrí el link nuevo que muestra la terminal."
  if (status === 403) return "El runner rechazó este sitio. Si usás un dominio propio, abrilo con --origin."
  if (status === 429) return body?.message || "El runner ya está trabajando en otras tareas. Esperá a que terminen."
  if (status === 400 || status === 413 || status === 415) return `El runner rechazó la tarea (${body?.error || status}).`
  return body?.message || body?.error || `El runner respondió ${status}.`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const AGENT_IDS: RunnerAgentId[] = ["claude", "codex", "gemini", "ollama"]

/** Keeps only well-formed agents from /status; the runner is local but still outside our code. */
export function normalizeAgents(value: unknown): RunnerAgent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): RunnerAgent[] => {
    if (!isRecord(item) || !AGENT_IDS.includes(item.id as RunnerAgentId)) return []
    return [{
      id: item.id as RunnerAgentId,
      label: typeof item.label === "string" ? item.label.slice(0, 40) : String(item.id),
      installed: item.installed === true,
      version: typeof item.version === "string" ? item.version.slice(0, 40) : null,
      loggedIn: typeof item.loggedIn === "boolean" ? item.loggedIn : null,
      ...(typeof item.detail === "string" ? { detail: item.detail.slice(0, 200) } : {}),
      ...(typeof item.loginHint === "string" ? { loginHint: item.loginHint.slice(0, 80) } : {}),
      ...(Array.isArray(item.models) ? { models: item.models.filter((model): model is string => typeof model === "string").slice(0, 20) } : {}),
    }]
  })
}

/**
 * Asks the runner what it found. Without a pairing it still tells "running but not paired"
 * (401) apart from "not running" (network error).
 */
export async function fetchRunnerStatus(
  port: number,
  token: string | null,
  { fetchImpl = fetch, probe = false, timeoutMs }: { fetchImpl?: FetchLike; probe?: boolean; timeoutMs?: number } = {},
): Promise<RunnerStatus> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? (probe ? PROBE_TIMEOUT_MS : STATUS_TIMEOUT_MS))
  try {
    const response = await fetchImpl(`${runnerBaseUrl(port)}/status${probe ? "?probe=1" : ""}`, {
      method: "GET",
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
    if (response.status === 401) return { state: "unauthorized" }
    const data = await response.json().catch(() => null) as unknown
    if (!response.ok || !isRecord(data)) return { state: "error", message: messageForStatus(response.status, isRecord(data) ? data as { error?: string } : null) }
    const runner = isRecord(data.runner) ? data.runner : {}
    return { state: "ready", version: typeof runner.version === "string" ? runner.version : "", agents: normalizeAgents(data.agents) }
  } catch {
    return { state: "offline" }
  } finally {
    clearTimeout(timer)
  }
}

/** Parses Server-Sent Events (`data: {...}` blocks); comments like `: ping` are skipped. */
export function createSseParser(onEvent: (event: RunnerEvent) => void) {
  let buffer = ""
  const flush = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")
    if (!data) return
    try {
      const parsed = JSON.parse(data) as unknown
      if (isRecord(parsed) && typeof parsed.type === "string") onEvent(parsed as RunnerEvent)
    } catch {
      // A malformed event is skipped; the rest of the stream still renders.
    }
  }
  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, "\n")
      const blocks = buffer.split("\n\n")
      buffer = blocks.pop() ?? ""
      blocks.forEach(flush)
    },
    end() {
      flush(buffer)
      buffer = ""
    },
  }
}

/** POSTs a task to the runner and feeds each streamed event to `onEvent`. Throws RunnerRequestError. */
export async function streamRunner(
  pairing: Pick<RunnerPairing, "token" | "port">,
  path: "/run" | "/orchestrate",
  body: Record<string, unknown>,
  onEvent: (event: RunnerEvent) => void,
  { fetchImpl = fetch, signal }: { fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): Promise<void> {
  let response: Response
  try {
    response = await fetchImpl(`${runnerBaseUrl(pairing.port)}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${pairing.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    throw new RunnerRequestError(0, offlineMessage(pairing.port))
  }
  const type = response.headers.get("content-type") || ""
  if (!response.ok || !type.includes("text/event-stream") || !response.body) {
    const data = await response.json().catch(() => null) as { error?: string; message?: string } | null
    throw new RunnerRequestError(response.status, messageForStatus(response.status, data))
  }
  const parser = createSseParser(onEvent)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parser.push(decoder.decode(value, { stream: true }))
  }
  parser.push(decoder.decode())
  parser.end()
}
