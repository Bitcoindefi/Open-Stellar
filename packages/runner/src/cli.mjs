// `agentic-city-runner`: starts the local runner, prints what it found and the pairing link.

import { readFileSync } from "node:fs"
import { createAgentRuntime, isValidModel } from "./agents.mjs"
import { DEFAULT_PORT, createRunnerServer } from "./server.mjs"
import { DEFAULT_APP_URL, generateToken, isValidToken, normalizeOrigin, pairingLink } from "./security.mjs"

const HELP = `agentic-city-runner: conecta tus CLIs de IA (Claude Code, Codex, Gemini CLI, Ollama) con Agentic City.

Uso:
  npx agentic-city-runner [opciones]
  node packages/runner/bin.mjs [opciones]   (desde un clon del repo, mientras no esté en npm)

Opciones:
  --port <n>            Puerto local (por defecto ${DEFAULT_PORT})
  --origin <url>        Permitir otro origen web además de Agentic City (repetible)
  --app <url>           Dirección de la app para el link de vinculación (por defecto ${DEFAULT_APP_URL})
  --timeout <segundos>  Tiempo máximo por tarea (por defecto 120)
  --ollama-model <id>   Modelo de Ollama a usar (por defecto, el primero de "ollama list")
  -h, --help            Esta ayuda
  -v, --version         Versión

Variables: AGENTIC_CITY_RUNNER_PORT, AGENTIC_CITY_RUNNER_ORIGINS (separadas por coma),
AGENTIC_CITY_RUNNER_TOKEN (fija la clave de vinculación; mínimo 24 caracteres).`

export function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    return String(pkg.version)
  } catch {
    return "0.0.0"
  }
}

/** Parses argv and env into options. Throws with a readable message on a bad value. */
export function parseArgs(argv, env = process.env) {
  const options = {
    port: DEFAULT_PORT,
    origins: [],
    appUrl: DEFAULT_APP_URL,
    timeoutMs: 120_000,
    ollamaModel: null,
    help: false,
    version: false,
  }
  if (env.AGENTIC_CITY_RUNNER_PORT) options.port = Number(env.AGENTIC_CITY_RUNNER_PORT)
  if (env.AGENTIC_CITY_RUNNER_ORIGINS) options.origins.push(...env.AGENTIC_CITY_RUNNER_ORIGINS.split(","))

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined]
    const value = () => {
      if (inline !== undefined) return inline
      i += 1
      if (i >= argv.length) throw new Error(`Falta el valor de ${flag}`)
      return argv[i]
    }
    switch (flag) {
      case "-h":
      case "--help":
        options.help = true
        break
      case "-v":
      case "--version":
        options.version = true
        break
      case "--port":
        options.port = Number(value())
        break
      case "--origin":
        options.origins.push(value())
        break
      case "--app":
        options.appUrl = value()
        break
      case "--timeout":
        options.timeoutMs = Number(value()) * 1000
        break
      case "--ollama-model":
        options.ollamaModel = value()
        break
      default:
        throw new Error(`Opción desconocida: ${arg}`)
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error("--port tiene que ser un número entre 1024 y 65535")
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 1_800_000) throw new Error("--timeout tiene que estar entre 5 y 1800 segundos")
  if (options.ollamaModel !== null && !isValidModel(options.ollamaModel)) throw new Error("--ollama-model no parece un nombre de modelo")
  const appOrigin = normalizeOrigin(options.appUrl)
  if (!appOrigin) throw new Error("--app tiene que ser una URL http(s)")
  options.appUrl = appOrigin
  options.origins = options.origins.map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    const normalized = normalizeOrigin(origin)
    if (!normalized) throw new Error(`Origen inválido: ${origin}`)
    return normalized
  })
  // The app the pairing link points at must be allowed to call back.
  if (!options.origins.includes(appOrigin)) options.origins.push(appOrigin)
  return options
}

function statusWord(agent) {
  if (!agent.installed) return "no instalado"
  if (agent.loggedIn === true) return "listo"
  if (agent.loggedIn === false) return agent.detail ? agent.detail : `sin sesión (corré: ${agent.loginHint})`
  return "instalado (la sesión se verifica en la primera tarea)"
}

export function formatAgentTable(agents) {
  return agents
    .map((agent) => `  ${agent.label.padEnd(12)} ${String(agent.version ?? "-").padEnd(10)} ${statusWord(agent)}`)
    .join("\n")
}

export async function main(argv = process.argv.slice(2), { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  let options
  try {
    options = parseArgs(argv, env)
  } catch (error) {
    stderr.write(`${error.message}\n\n${HELP}\n`)
    return 2
  }
  const version = readVersion()
  if (options.help) {
    stdout.write(`${HELP}\n`)
    return 0
  }
  if (options.version) {
    stdout.write(`${version}\n`)
    return 0
  }

  const fixedToken = env.AGENTIC_CITY_RUNNER_TOKEN
  if (fixedToken !== undefined && !isValidToken(fixedToken)) {
    stderr.write("AGENTIC_CITY_RUNNER_TOKEN tiene que tener entre 24 y 128 caracteres (letras, números, - o _).\n")
    return 2
  }
  const token = fixedToken || generateToken()
  const runtime = createAgentRuntime({ timeoutMs: options.timeoutMs, ollamaModel: options.ollamaModel })
  const runner = createRunnerServer({
    token,
    port: options.port,
    extraOrigins: options.origins,
    runtime,
    version,
    log: (line) => stdout.write(`  ${new Date().toLocaleTimeString()}  ${line}\n`),
  })

  try {
    await runner.listen()
  } catch (error) {
    const busy = error && error.code === "EADDRINUSE"
    stderr.write(busy ? `El puerto ${options.port} está ocupado. ¿Ya hay un runner abierto? Probá con --port ${options.port + 1}.\n` : `No se pudo abrir el puerto: ${error.message}\n`)
    return 1
  }

  stdout.write(`\nAgentic City runner ${version}\nEscuchando en http://127.0.0.1:${options.port} (solo esta PC)\n\nBuscando agentes...\n`)
  const agents = await runtime.status({ fresh: true })
  stdout.write(`${formatAgentTable(agents)}\n\n`)
  stdout.write(`Abrí este link para vincular tu navegador (vale mientras el runner esté abierto):\n  ${pairingLink(options.appUrl, token, options.port, DEFAULT_PORT)}\n`)
  if (options.appUrl !== "http://localhost:3000") {
    stdout.write(`  local: ${pairingLink("http://localhost:3000", token, options.port, DEFAULT_PORT)}\n`)
  }
  stdout.write("\nNo compartas ese link. Ctrl+C para cerrar.\n\n")

  await new Promise((resolve) => {
    const shutdown = () => {
      stdout.write("\nCerrando el runner...\n")
      runner.close().then(resolve)
    }
    process.once("SIGINT", shutdown)
    process.once("SIGTERM", shutdown)
  })
  return 0
}
