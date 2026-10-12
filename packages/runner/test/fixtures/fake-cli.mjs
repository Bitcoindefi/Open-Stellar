#!/usr/bin/env node
// Stands in for claude / codex / gemini / ollama in tests and local end-to-end checks.
// Usage: node fake-cli.mjs <agent> [args...]. It checks that the runner passed the read-only flags
// and answers like the real CLI would (status commands, planning JSON, a synthesis, plain answers).

import { writeFileSync } from "node:fs"

const [agent, ...args] = process.argv.slice(2)
const loggedOut = (process.env.FAKE_LOGGED_OUT || "").split(",").includes(agent)

function readStdin() {
  return new Promise((resolve) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => { data += chunk })
    process.stdin.on("end", () => resolve(data))
  })
}

function fail(message, code = 3) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

if (args[0] === "--version") {
  process.stdout.write(agent === "ollama" ? "ollama version is 9.9.9\n" : `${agent} 9.9.9-fake\n`)
  process.exit(0)
}

if (agent === "claude" && args[0] === "auth" && args[1] === "status") {
  process.stdout.write(`${JSON.stringify({ loggedIn: !loggedOut, authMethod: loggedOut ? "none" : "fake" }, null, 2)}\n`)
  process.exit(loggedOut ? 1 : 0)
}
if (agent === "codex" && args[0] === "login" && args[1] === "status") {
  if (loggedOut) fail("Not logged in", 1)
  process.stderr.write("Logged in using ChatGPT (fake)\n")
  process.exit(0)
}
if (agent === "ollama" && args[0] === "list") {
  process.stdout.write("NAME               ID              SIZE      MODIFIED\nllama3.2:latest    a80c4f17acd5    2.0 GB    1 day ago\n")
  process.exit(0)
}

// From here on it is a prompt run: verify the runner asked for a safe, non-interactive mode.
if (agent === "claude" && !(args.includes("-p") && args[args.indexOf("--tools") + 1] === "")) fail("claude: expected -p and --tools \"\"")
if (agent === "codex" && !(args[0] === "exec" && args[args.indexOf("--sandbox") + 1] === "read-only" && args.at(-1) === "-")) fail("codex: expected exec --sandbox read-only -")
if (agent === "gemini" && args[args.indexOf("--approval-mode") + 1] !== "plan") fail("gemini: expected --approval-mode plan")
if (agent === "ollama" && args[0] !== "run") fail("ollama: expected run <model>")

const prompt = await readStdin()
if (loggedOut) fail(agent === "gemini" ? "Please set an Auth method in your settings.json" : "Not logged in. Please run /login", 1)
const sleepMs = Number(process.env.FAKE_SLEEP_MS || 0)
if (sleepMs) await new Promise((resolve) => setTimeout(resolve, sleepMs))

let answer
if (prompt.includes("Reply with ONLY a JSON array")) {
  if (process.env.FAKE_BAD_PLAN === "1") {
    answer = "I think Codex should do it, then Gemini."
  } else {
    const roster = [...prompt.matchAll(/^- ([a-z]+): /gm)].map((match) => match[1])
    const task = prompt.split("Task:\n").pop().trim().slice(0, 60)
    answer = JSON.stringify(roster.slice(0, 2).map((id, index) => ({ agent: id, subtask: `Parte ${index + 1} de: ${task}` })))
  }
} else if (prompt.includes("Your team worked on the task below")) {
  const steps = (prompt.match(/^### Step /gm) || []).length
  answer = `Respuesta final de ${agent} (fake): junté ${steps} resultados.`
} else {
  answer = `${agent} (fake) recibió: ${prompt.replace(/\s+/g, " ").trim().slice(0, 80)}`
}

if (agent === "claude") {
  const line = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)
  line({ type: "system", subtype: "init", tools: [] })
  line({ type: "assistant", message: { content: [{ type: "text", text: answer }] } })
  line({ type: "result", subtype: "success", is_error: false, result: answer })
} else if (agent === "codex") {
  const out = args[args.indexOf("--output-last-message") + 1]
  process.stderr.write("[fake codex] thinking...\n")
  if (out) writeFileSync(out, answer)
  process.stdout.write(`${answer}\n`)
} else {
  process.stdout.write(`${answer}\n`)
}
