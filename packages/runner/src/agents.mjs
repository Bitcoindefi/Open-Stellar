// The CLIs the runner knows how to drive. Each entry says how to find it, how to ask whether it
// is logged in (with the CLI's own status command, never by reading credential files) and how to
// run one prompt non-interactively in a read-only mode. The prompt goes on stdin.

import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DEFAULT_MAX_OUTPUT_BYTES, DEFAULT_TIMEOUT_MS, resolveCommand, runProcess, stripAnsi } from "./exec.mjs"

export const AGENT_ORDER = ["claude", "codex", "gemini", "ollama"]

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/
const VERSION_PATTERN = /\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?/
const AUTH_ERROR_PATTERN = /not logged in|please (?:run )?\/?login|log ?in (?:first|again)|auth(?:entication)? (?:method|required|failed)|unauthori[sz]ed|invalid api key|api key not (?:found|set)|GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/i
const STATUS_TIMEOUT_MS = 15_000
const PROBE_TIMEOUT_MS = 30_000
const PROBE_PROMPT = "Reply with the single word OK."

/** Model names go into argv, so they must look like a model name and nothing else. */
export function isValidModel(model) {
  return typeof model === "string" && MODEL_PATTERN.test(model)
}

export function parseVersion(text) {
  const match = VERSION_PATTERN.exec(stripAnsi(text || ""))
  return match ? match[0] : null
}

/** Finds the first JSON object in a CLI's output (some print a banner before it). */
export function extractJsonObject(text) {
  const source = String(text || "")
  const start = source.indexOf("{")
  const end = source.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    const value = JSON.parse(source.slice(start, end + 1))
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/** `ollama list` prints a header and one model per line; the first column is the name. */
export function parseOllamaList(text) {
  return stripAnsi(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^NAME(?:\s|$)/i.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter(isValidModel)
}

export function looksLikeAuthError(text) {
  return AUTH_ERROR_PATTERN.test(String(text || ""))
}

export const AGENTS = {
  claude: {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    loginHint: "claude auth login",
    statusArgs: ["auth", "status", "--json"],
    parseStatus(result) {
      const json = extractJsonObject(result.stdout)
      if (json && typeof json.loggedIn === "boolean") return { loggedIn: json.loggedIn }
      return { loggedIn: result.code === 0 ? null : false }
    },
    // -p reads the prompt from stdin. --tools "" turns off every built-in tool (no edits, no
    // shell, no file reads) and --strict-mcp-config skips the user's MCP servers.
    runArgs({ model }) {
      return [
        "-p",
        "--output-format", "stream-json",
        "--verbose",
        "--tools", "",
        "--strict-mcp-config",
        "--no-session-persistence",
        ...(model ? ["--model", model] : []),
      ]
    },
    output: "claude-stream-json",
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    command: "codex",
    loginHint: "codex login",
    statusArgs: ["login", "status"],
    parseStatus(result) {
      const text = `${result.stdout}\n${result.stderr}`
      if (/not logged in/i.test(text)) return { loggedIn: false }
      if (result.code === 0 && /logged in/i.test(text)) return { loggedIn: true }
      return { loggedIn: result.code === 0 ? null : false }
    },
    // `-` reads the prompt from stdin. The read-only sandbox blocks writes and network for any
    // command the model runs; --ephemeral keeps no session files.
    runArgs({ model, workdir }) {
      return [
        "exec",
        "--sandbox", "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "--color", "never",
        "--output-last-message", path.join(workdir, "last-message.txt"),
        ...(model ? ["--model", model] : []),
        "-",
      ]
    },
    lastMessageFile: "last-message.txt",
    output: "text",
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    command: "gemini",
    loginHint: "gemini (y elegí Login with Google)",
    statusArgs: null,
    // Headless mode: the stdin text comes first and this fixed -p line is appended to it.
    // --approval-mode plan is Gemini's read-only mode; --skip-trust trusts only the empty temp dir.
    runArgs({ model }) {
      return [
        "-p", "Respond to the request above.",
        "--approval-mode", "plan",
        "--skip-trust",
        "--output-format", "text",
        ...(model ? ["--model", model] : []),
      ]
    },
    output: "text",
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    command: "ollama",
    loginHint: "ollama serve, y despues ollama pull llama3.2",
    statusArgs: ["list"],
    parseStatus(result) {
      if (result.code !== 0) return { loggedIn: false, detail: "Ollama no responde: corré ollama serve" }
      const models = parseOllamaList(result.stdout)
      return models.length > 0
        ? { loggedIn: true, models }
        : { loggedIn: false, models, detail: "Sin modelos: corré ollama pull llama3.2" }
    },
    runArgs({ model }) {
      return ["run", model, "--nowordwrap"]
    },
    requiresModel: true,
    output: "text",
  },
}

export function agentLabel(agentId) {
  return AGENTS[agentId]?.label ?? agentId
}

/**
 * Claude Code's stream-json prints one JSON object per line. Assistant messages carry the text
 * as it is written and the final `result` line carries the answer (or the error).
 */
export function createClaudeStreamParser() {
  let buffer = ""
  let result = null
  let isError = false
  let sawResult = false
  const texts = []

  const readLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return []
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      return []
    }
    if (event?.type === "assistant" && Array.isArray(event.message?.content)) {
      const out = []
      for (const block of event.message.content) {
        if (block?.type === "text" && typeof block.text === "string" && block.text) {
          out.push(texts.length > 0 ? `\n\n${block.text}` : block.text)
          texts.push(block.text)
        }
      }
      return out
    }
    if (event?.type === "result") {
      sawResult = true
      result = typeof event.result === "string" ? event.result : null
      isError = event.is_error === true || (typeof event.subtype === "string" && event.subtype !== "success")
    }
    return []
  }

  return {
    push(text) {
      buffer += text
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      return lines.flatMap(readLine)
    },
    finish() {
      const tail = readLine(buffer)
      buffer = ""
      const text = (result ?? texts.join("\n\n")).trim()
      return { text, isError, sawResult, extraChunks: tail }
    },
  }
}

export function createTextParser() {
  return {
    push(text) {
      const clean = stripAnsi(text)
      return clean ? [clean] : []
    },
    finish(stdout) {
      return { text: stripAnsi(stdout || "").trim(), isError: false, sawResult: true, extraChunks: [] }
    },
  }
}

function createOutputParser(kind) {
  return kind === "claude-stream-json" ? createClaudeStreamParser() : createTextParser()
}

function clipTail(text, max = 400) {
  const clean = stripAnsi(text || "").trim()
  return clean.length > max ? `...${clean.slice(-max)}` : clean
}

/**
 * Runs one prompt on one agent in a fresh temp folder that is deleted afterwards.
 * @returns {Promise<{ ok: boolean, text: string, error?: string, durationMs: number, truncated: boolean, timedOut: boolean }>}
 */
export async function runAgent({
  agentId,
  prompt,
  model,
  resolve = (name) => resolveCommand(name),
  exec = runProcess,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  onChunk,
  signal,
  tmpRoot = os.tmpdir(),
}) {
  const def = AGENTS[agentId]
  const fail = (error) => ({ ok: false, text: "", error, durationMs: 0, truncated: false, timedOut: false })
  if (!def) return fail(`Agente desconocido: ${agentId}`)
  const command = resolve(def.command)
  if (!command) return fail(`${def.label} no está instalado en esta PC.`)
  if (model !== undefined && model !== null && !isValidModel(model)) return fail("Nombre de modelo inválido.")
  if (def.requiresModel && !model) return fail(`${def.label} necesita un modelo: corré ollama pull llama3.2 o pasá --ollama-model.`)

  const workdir = await mkdtemp(path.join(tmpRoot, "agentic-city-run-"))
  try {
    const parser = createOutputParser(def.output)
    const emit = (chunks) => chunks.forEach((chunk) => chunk && onChunk?.(chunk))
    let result
    try {
      result = await exec({
        command,
        args: def.runArgs({ model, workdir }),
        input: prompt,
        cwd: workdir,
        timeoutMs,
        maxOutputBytes,
        signal,
        onStdout: (text) => emit(parser.push(text)),
      })
    } catch (error) {
      return fail(`No se pudo iniciar ${def.label}: ${error instanceof Error ? error.message : String(error)}`)
    }
    const parsed = parser.finish(result.stdout)
    emit(parsed.extraChunks)
    let text = parsed.text
    if (def.lastMessageFile) {
      const last = await readFile(path.join(workdir, def.lastMessageFile), "utf8").catch(() => "")
      if (last.trim()) text = last.trim()
    }
    const base = { text, durationMs: result.durationMs, truncated: result.truncated, timedOut: result.timedOut }
    if (result.aborted) return { ...base, ok: false, error: "Cancelado." }
    if (result.timedOut) return { ...base, ok: false, error: `${def.label} no terminó en ${Math.round(timeoutMs / 1000)} s y se cortó.` }
    if (result.truncated) return { ...base, ok: true, text: `${text}\n\n[salida recortada]` }
    const failed = result.code !== 0 || parsed.isError
    if (!failed && text) return { ...base, ok: true }
    const detail = parsed.isError ? text : clipTail(result.stderr) || clipTail(result.stdout)
    if (looksLikeAuthError(`${detail}\n${result.stderr}`)) {
      return { ...base, ok: false, authError: true, error: `${def.label} no tiene sesión iniciada. Corré: ${def.loginHint}` }
    }
    if (!failed) return { ...base, ok: false, error: `${def.label} no devolvió texto.` }
    return { ...base, ok: false, error: `${def.label} terminó con error${detail ? `: ${detail}` : "."}` }
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Detects one agent: installed or not, its version, and whether it is logged in.
 * `probe` runs a one-line prompt for CLIs without a status command (Gemini).
 */
export async function detectAgent(agentId, { resolve = (name) => resolveCommand(name), exec = runProcess, probe = false, runAgentImpl = runAgent, tmpRoot } = {}) {
  const def = AGENTS[agentId]
  const base = { id: agentId, label: def?.label ?? agentId, installed: false, version: null, loggedIn: null, loginHint: def?.loginHint ?? null }
  if (!def) return { ...base, detail: "Agente desconocido" }
  const command = resolve(def.command)
  if (!command) return base

  const info = { ...base, installed: true }
  try {
    const version = await exec({ command, args: ["--version"], timeoutMs: STATUS_TIMEOUT_MS, maxOutputBytes: 8192 })
    info.version = parseVersion(`${version.stdout}\n${version.stderr}`)
  } catch {
    // Still installed; the version is just unknown.
  }

  if (def.statusArgs) {
    try {
      const status = await exec({ command, args: def.statusArgs, timeoutMs: STATUS_TIMEOUT_MS, maxOutputBytes: 64 * 1024 })
      const parsed = def.parseStatus(status)
      info.loggedIn = parsed.loggedIn
      if (parsed.detail) info.detail = parsed.detail
      if (parsed.models) info.models = parsed.models
    } catch {
      info.loggedIn = null
    }
  } else if (probe) {
    const result = await runAgentImpl({ agentId, prompt: PROBE_PROMPT, resolve: () => command, exec, timeoutMs: PROBE_TIMEOUT_MS, maxOutputBytes: 16 * 1024, tmpRoot })
    if (result.ok) info.loggedIn = true
    else if (result.authError || looksLikeAuthError(result.error)) info.loggedIn = false
    else info.detail = result.error
  }
  return info
}

/**
 * Keeps the last detection for a short while so the web app can poll /status cheaply,
 * and runs prompts with the configured limits.
 */
export function createAgentRuntime({
  env = process.env,
  platform = process.platform,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  ollamaModel = null,
  exec = runProcess,
  cacheMs = 30_000,
  now = Date.now,
  tmpRoot = os.tmpdir(),
  resolve = (name) => resolveCommand(name, { env, platform }),
} = {}) {
  let cache = null
  const probes = new Map()

  const status = async ({ probe = false, fresh = false } = {}) => {
    if (!probe && !fresh && cache && now() - cache.at < cacheMs) return cache.agents
    const agents = await Promise.all(AGENT_ORDER.map((id) => detectAgent(id, { resolve, exec, probe, tmpRoot })))
    for (const agent of agents) {
      if (probe && AGENTS[agent.id].statusArgs === null && agent.installed) probes.set(agent.id, agent.loggedIn)
      else if (AGENTS[agent.id].statusArgs === null && probes.has(agent.id)) agent.loggedIn = probes.get(agent.id)
    }
    cache = { at: now(), agents }
    return agents
  }

  const modelFor = (agentId, requested) => {
    if (requested) return requested
    if (agentId !== "ollama") return null
    if (ollamaModel) return ollamaModel
    const ollama = cache?.agents.find((agent) => agent.id === "ollama")
    return ollama?.models?.[0] ?? null
  }

  return {
    status,
    /** Agents that are installed and not known to be logged out. */
    async usableAgents() {
      const agents = await status()
      return agents.filter((agent) => agent.installed && agent.loggedIn !== false).map((agent) => agent.id)
    },
    async run(agentId, prompt, { onChunk, signal, model } = {}) {
      if (agentId === "ollama" && !cache) await status()
      return runAgent({ agentId, prompt, model: modelFor(agentId, model), resolve, exec, timeoutMs, maxOutputBytes, onChunk, signal, tmpRoot })
    },
  }
}
