// Runs one CLI as a child process: no shell for user input, a timeout, an output cap and a
// clean kill of the whole process tree. The prompt always travels on stdin, never in argv.

import { spawn } from "node:child_process"
import { accessSync, constants, statSync } from "node:fs"
import path from "node:path"
import { StringDecoder } from "node:string_decoder"

export const DEFAULT_TIMEOUT_MS = 120_000
export const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024
const STDERR_TAIL_BYTES = 8 * 1024
const KILL_GRACE_MS = 2_000

// Colors and cursor moves some CLIs still print when stdout is not a terminal.
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\r/g

/** Removes ANSI escape sequences and carriage returns. */
export function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, "")
}

function defaultIsExecutable(candidate, platform) {
  try {
    if (!statSync(candidate).isFile()) return false
    if (platform !== "win32") accessSync(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Finds an executable on PATH the way a shell would, without starting a shell.
 * On Windows it also tries each PATHEXT extension (claude.exe, codex.cmd, ...).
 * @returns {string | null} absolute path, or null when the command is not installed
 */
export function resolveCommand(name, { env = process.env, platform = process.platform, isExecutable = defaultIsExecutable } = {}) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) return null
  const lib = platform === "win32" ? path.win32 : path.posix
  const pathValue = env.PATH ?? env.Path ?? env.path ?? ""
  const dirs = pathValue.split(platform === "win32" ? ";" : ":").filter(Boolean)
  const extensions = platform === "win32"
    ? ["", ...(env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)]
    : [""]
  for (const dir of dirs) {
    for (const extension of extensions) {
      // On Windows a bare name without extension is not runnable; skip it.
      if (platform === "win32" && extension === "") continue
      const candidate = lib.join(dir, `${name}${extension.toLowerCase()}`)
      if (isExecutable(candidate, platform)) return candidate
    }
  }
  return null
}

/** True when Windows can only start this file through cmd.exe (npm shims are .cmd files). */
export function needsWindowsShell(command, platform = process.platform) {
  return platform === "win32" && /\.(cmd|bat)$/i.test(command)
}

/**
 * Quotes one argument for cmd.exe. Only used for the fixed flags the runner itself chooses
 * (user text never reaches argv), and it refuses characters cmd.exe would interpret.
 */
export function quoteForCmd(arg) {
  const value = String(arg)
  if (/[%!^&|<>\r\n"]/.test(value)) throw new Error(`Unsafe argument for cmd.exe: ${value}`)
  if (value === "") return '""'
  return /^[\w.,:/\\=@+-]+$/.test(value) ? value : `"${value}"`
}

function killTree(child, platform, spawnImpl) {
  if (!child.pid || child.exitCode !== null) return
  if (platform === "win32") {
    try {
      spawnImpl("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
    } catch {
      child.kill()
    }
    return
  }
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal)
    } catch {
      try { child.kill(signal) } catch { /* already gone */ }
    }
  }
  signalGroup("SIGTERM")
  const timer = setTimeout(() => signalGroup("SIGKILL"), KILL_GRACE_MS)
  timer.unref?.()
}

/**
 * Runs a command and resolves when it exits (or is killed).
 * @param {{
 *   command: string, args?: string[], input?: string, cwd?: string, env?: NodeJS.ProcessEnv,
 *   timeoutMs?: number, maxOutputBytes?: number, onStdout?: (text: string) => void,
 *   signal?: AbortSignal, platform?: NodeJS.Platform, spawnImpl?: typeof spawn
 * }} options
 * @returns {Promise<{ code: number | null, signal: string | null, stdout: string, stderr: string,
 *   timedOut: boolean, truncated: boolean, aborted: boolean, durationMs: number }>}
 */
export function runProcess(options) {
  const {
    command,
    args = [],
    input = "",
    cwd,
    env = process.env,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    onStdout,
    signal,
    platform = process.platform,
    spawnImpl = spawn,
  } = options

  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const shell = needsWindowsShell(command, platform)
    let file = command
    let argv = args
    if (shell) {
      file = `"${command}"`
      argv = args.map(quoteForCmd)
    }

    let child
    try {
      child = spawnImpl(file, argv, {
        cwd,
        env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0" },
        shell,
        windowsHide: true,
        detached: platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch (error) {
      reject(error)
      return
    }

    let stdout = ""
    let stdoutBytes = 0
    let stderr = ""
    let timedOut = false
    let truncated = false
    let aborted = false
    let settled = false
    const decoder = new StringDecoder("utf8")
    const errDecoder = new StringDecoder("utf8")

    const stop = () => killTree(child, platform, spawnImpl)
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, timeoutMs)
    timer.unref?.()

    const onAbort = () => {
      aborted = true
      stop()
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener("abort", onAbort, { once: true })
    }

    child.stdout?.on("data", (chunk) => {
      if (truncated) return
      const room = maxOutputBytes - stdoutBytes
      let piece = chunk
      if (chunk.length > room) {
        piece = chunk.subarray(0, Math.max(0, room))
        truncated = true
      }
      stdoutBytes += piece.length
      const text = decoder.write(piece)
      if (text) {
        stdout += text
        onStdout?.(text)
      }
      if (truncated) stop()
    })

    child.stderr?.on("data", (chunk) => {
      stderr += errDecoder.write(chunk)
      if (stderr.length > STDERR_TAIL_BYTES) stderr = stderr.slice(-STDERR_TAIL_BYTES)
    })

    // A CLI that exits before reading stdin makes the write fail with EPIPE; that is not our error.
    child.stdin?.on("error", () => {})
    if (child.stdin) {
      child.stdin.end(input)
    }

    const finish = (code, exitSignal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      const rest = decoder.end()
      if (rest && !truncated) {
        stdout += rest
        onStdout?.(rest)
      }
      stderr += errDecoder.end()
      resolve({
        code,
        signal: exitSignal ?? null,
        stdout,
        stderr,
        timedOut,
        truncated,
        aborted,
        durationMs: Date.now() - startedAt,
      })
    }

    child.on("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      reject(error)
    })
    child.on("close", finish)
  })
}
