// Test helpers: a temp folder with fake claude/codex/gemini/ollama executables on it.

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const FAKE_CLI = fileURLToPath(new URL("./fixtures/fake-cli.mjs", import.meta.url))
export const IS_WINDOWS = process.platform === "win32"

export async function makeFakePath(agents = ["claude", "codex", "gemini", "ollama"]) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agentic-city-fake-cli-"))
  for (const agent of agents) {
    const file = path.join(dir, agent)
    await writeFile(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLI}" ${agent} "$@"\n`)
    await chmod(file, 0o755)
  }
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

/** Collects the SSE `data:` events of a fetch Response. */
export async function readSse(response) {
  const text = await response.text()
  return text
    .split("\n\n")
    .map((block) => block.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n"))
    .filter(Boolean)
    .map((data) => JSON.parse(data))
}
