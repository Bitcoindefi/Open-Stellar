// Pairing with the local runner (packages/runner). The runner prints a link like
// https://agentic-city.vercel.app/runner#<token>; the token lives only in this browser's
// localStorage and goes as a bearer to 127.0.0.1. The Vercel server never sees it.

export const RUNNER_DEFAULT_PORT = 7421
export const RUNNER_STORAGE_KEY = "agentic-city:runner:v1"
// Until agentic-city-runner is published to npm, run it from a shallow clone. Two lines instead of `&&`
// so the same paste works in bash, zsh, cmd and Windows PowerShell 5.1.
export const RUNNER_COMMAND = [
  "git clone --depth 1 https://github.com/Bitcoindefi/agentic-city",
  "node agentic-city/packages/runner/bin.mjs",
].join("\n")

export type RunnerPairing = { token: string; port: number; pairedAt: string }

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/

export function isValidRunnerToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token)
}

export function isValidRunnerPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535
}

/** Reads `#<token>` or `#token=<token>&port=<port>` from a location hash. */
export function parsePairingHash(hash: string, now: () => Date = () => new Date()): RunnerPairing | null {
  const raw = String(hash || "").replace(/^#/, "").trim()
  if (!raw) return null
  let token: string | null = raw
  let port = RUNNER_DEFAULT_PORT
  if (raw.includes("=")) {
    const params = new URLSearchParams(raw)
    token = params.get("token")
    const portText = params.get("port")
    if (portText !== null) port = Number(portText)
  }
  if (!isValidRunnerToken(token) || !isValidRunnerPort(port)) return null
  return { token, port, pairedAt: now().toISOString() }
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function readRunnerPairing(storage: Storage | null = defaultStorage()): RunnerPairing | null {
  if (!storage) return null
  try {
    const parsed = JSON.parse(storage.getItem(RUNNER_STORAGE_KEY) || "null") as Partial<RunnerPairing> | null
    if (!parsed || !isValidRunnerToken(parsed.token) || !isValidRunnerPort(parsed.port)) return null
    return { token: parsed.token, port: parsed.port, pairedAt: typeof parsed.pairedAt === "string" ? parsed.pairedAt : "" }
  } catch {
    return null
  }
}

/** Saves the pairing. Returns false when storage is blocked (private mode, disabled site data). */
export function writeRunnerPairing(pairing: RunnerPairing, storage: Storage | null = defaultStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(RUNNER_STORAGE_KEY, JSON.stringify(pairing))
    return true
  } catch {
    return false
  }
}

export function clearRunnerPairing(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(RUNNER_STORAGE_KEY)
  } catch {
    // Nothing else to do: the token simply stays until the runner restarts with a new one.
  }
}
