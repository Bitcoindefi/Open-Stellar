import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  AGENTS,
  createAgentRuntime,
  createClaudeStreamParser,
  createTextParser,
  detectAgent,
  extractJsonObject,
  isValidModel,
  looksLikeAuthError,
  parseOllamaList,
  parseVersion,
  runAgent,
} from "../src/agents.mjs"
import { IS_WINDOWS, makeFakePath } from "./helpers.mjs"

const okResult = (overrides = {}) => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, truncated: false, aborted: false, durationMs: 12, ...overrides })

describe("parsers", () => {
  it("reads versions from each CLI's --version output", () => {
    expect(parseVersion("2.1.296 (Claude Code)")).toBe("2.1.296")
    expect(parseVersion("codex-cli 0.150.1")).toBe("0.150.1")
    expect(parseVersion("ollama version is 0.12.3\nWarning: could not connect")).toBe("0.12.3")
    expect(parseVersion("\u001b[1m0.63.0-preview.1\u001b[0m")).toBe("0.63.0-preview.1")
    expect(parseVersion("no version here")).toBeNull()
    expect(parseVersion(undefined)).toBeNull()
  })

  it("finds a JSON object after a banner", () => {
    expect(extractJsonObject("banner\n{\"loggedIn\": true}\n")).toEqual({ loggedIn: true })
    expect(extractJsonObject("[1,2]")).toBeNull()
    expect(extractJsonObject("{broken")).toBeNull()
    expect(extractJsonObject("{\"a\": }")).toBeNull()
  })

  it("lists Ollama models and skips the header", () => {
    expect(parseOllamaList("NAME  ID  SIZE\nllama3.2:latest  abc  2 GB\nqwen2.5-coder:7b  def  4 GB\n\n")).toEqual(["llama3.2:latest", "qwen2.5-coder:7b"])
    expect(parseOllamaList("NAME ID SIZE MODIFIED\n")).toEqual([])
  })

  it("validates model names that go into argv", () => {
    expect(isValidModel("llama3.2:latest")).toBe(true)
    expect(isValidModel("anthropic/claude-x")).toBe(true)
    expect(isValidModel("--dangerously-skip-permissions")).toBe(false)
    expect(isValidModel("a b")).toBe(false)
    expect(isValidModel("x;rm")).toBe(false)
    expect(isValidModel(42)).toBe(false)
  })

  it("recognizes login errors", () => {
    expect(looksLikeAuthError("Not logged in · Please run /login")).toBe(true)
    expect(looksLikeAuthError("Please set an Auth method in your settings.json")).toBe(true)
    expect(looksLikeAuthError("401 Unauthorized")).toBe(true)
    expect(looksLikeAuthError("rate limited")).toBe(false)
  })
})

describe("status commands (no credential files are read)", () => {
  it("claude uses `auth status --json`", () => {
    expect(AGENTS.claude.statusArgs).toEqual(["auth", "status", "--json"])
    expect(AGENTS.claude.parseStatus(okResult({ stdout: "{\"loggedIn\": true}" }))).toEqual({ loggedIn: true })
    expect(AGENTS.claude.parseStatus(okResult({ code: 1, stdout: "{\"loggedIn\": false}" }))).toEqual({ loggedIn: false })
    expect(AGENTS.claude.parseStatus(okResult({ stdout: "weird" }))).toEqual({ loggedIn: null })
    expect(AGENTS.claude.parseStatus(okResult({ code: 2, stdout: "" }))).toEqual({ loggedIn: false })
  })

  it("codex uses `login status`", () => {
    expect(AGENTS.codex.parseStatus(okResult({ stderr: "Logged in using ChatGPT" }))).toEqual({ loggedIn: true })
    expect(AGENTS.codex.parseStatus(okResult({ code: 1, stderr: "Not logged in" }))).toEqual({ loggedIn: false })
    expect(AGENTS.codex.parseStatus(okResult({ stdout: "?" }))).toEqual({ loggedIn: null })
    expect(AGENTS.codex.parseStatus(okResult({ code: 1 }))).toEqual({ loggedIn: false })
  })

  it("ollama is ready when the server answers and has a model", () => {
    expect(AGENTS.ollama.parseStatus(okResult({ stdout: "NAME ID\nllama3.2 abc\n" }))).toEqual({ loggedIn: true, models: ["llama3.2"] })
    expect(AGENTS.ollama.parseStatus(okResult({ stdout: "NAME ID\n" }))).toMatchObject({ loggedIn: false, detail: expect.stringContaining("pull") })
    expect(AGENTS.ollama.parseStatus(okResult({ code: 1 }))).toMatchObject({ loggedIn: false, detail: expect.stringContaining("serve") })
  })
})

describe("run arguments are read-only and never contain the prompt", () => {
  it("claude: print mode, no tools, no MCP, no session files", () => {
    const args = AGENTS.claude.runArgs({ model: null, workdir: "/tmp/w" })
    expect(args).toContain("-p")
    expect(args[args.indexOf("--tools") + 1]).toBe("")
    expect(args).toContain("--strict-mcp-config")
    expect(args).toContain("--no-session-persistence")
    expect(args).not.toContain("--dangerously-skip-permissions")
    expect(AGENTS.claude.runArgs({ model: "sonnet" }).slice(-2)).toEqual(["--model", "sonnet"])
  })

  it("codex: exec with the read-only sandbox, prompt from stdin", () => {
    const args = AGENTS.codex.runArgs({ model: null, workdir: "/tmp/w" })
    expect(args[0]).toBe("exec")
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only")
    expect(args.at(-1)).toBe("-")
    expect(args).toContain("--ephemeral")
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox")
  })

  it("gemini: headless plan (read-only) mode", () => {
    const args = AGENTS.gemini.runArgs({ model: "gemini-2.5-pro" })
    expect(args[args.indexOf("--approval-mode") + 1]).toBe("plan")
    expect(args).not.toContain("--yolo")
    expect(args.slice(-2)).toEqual(["--model", "gemini-2.5-pro"])
  })

  it("ollama: run <model>", () => {
    expect(AGENTS.ollama.runArgs({ model: "llama3.2" })).toEqual(["run", "llama3.2", "--nowordwrap"])
  })
})

describe("output parsers", () => {
  it("reads Claude's stream-json across chunk boundaries", () => {
    const parser = createClaudeStreamParser()
    const lines = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hola" }, { type: "tool_use" }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "mundo" }] } }),
      "not json",
      JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Hola mundo" }),
    ].join("\n")
    const chunks = [...parser.push(lines.slice(0, 50)), ...parser.push(lines.slice(50))]
    const final = parser.finish()
    expect(chunks).toEqual(["Hola", "\n\nmundo"])
    expect(final).toMatchObject({ text: "Hola mundo", isError: false, sawResult: true })
  })

  it("flags an error result and falls back to the streamed text", () => {
    const parser = createClaudeStreamParser()
    parser.push(`${JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, result: "Not logged in" })}\n`)
    expect(parser.finish()).toMatchObject({ isError: true, text: "Not logged in" })
    const partial = createClaudeStreamParser()
    partial.push(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "solo" }] } }))
    expect(partial.finish()).toMatchObject({ text: "solo", sawResult: false, extraChunks: ["solo"] })
  })

  it("strips ANSI from plain text output", () => {
    const parser = createTextParser()
    expect(parser.push("\u001b[32mhi\u001b[0m")).toEqual(["hi"])
    expect(parser.push("\u001b[0m")).toEqual([])
    expect(parser.finish("  \u001b[32mhi\u001b[0m \n")).toMatchObject({ text: "hi" })
  })
})

describe("runAgent", () => {
  const resolveAll = (name) => `/usr/bin/${name}`

  it("passes the prompt on stdin, streams chunks and returns the text", async () => {
    const calls = []
    const chunks = []
    const exec = async (options) => {
      calls.push(options)
      options.onStdout("partial ")
      options.onStdout("answer")
      return okResult({ stdout: "partial answer" })
    }
    const result = await runAgent({ agentId: "gemini", prompt: "secret task; rm -rf /", resolve: resolveAll, exec, onChunk: (text) => chunks.push(text) })
    expect(result).toMatchObject({ ok: true, text: "partial answer" })
    expect(chunks).toEqual(["partial ", "answer"])
    expect(calls[0].input).toBe("secret task; rm -rf /")
    expect(calls[0].args.join(" ")).not.toContain("secret task")
    expect(calls[0].cwd).toMatch(/agentic-city-run-/)
  })

  it("explains a missing CLI, a bad model and a missing Ollama model", async () => {
    expect(await runAgent({ agentId: "claude", prompt: "x", resolve: () => null })).toMatchObject({ ok: false, error: expect.stringContaining("no está instalado") })
    expect(await runAgent({ agentId: "nope", prompt: "x", resolve: resolveAll })).toMatchObject({ ok: false, error: expect.stringContaining("desconocido") })
    expect(await runAgent({ agentId: "ollama", prompt: "x", model: "--evil", resolve: resolveAll })).toMatchObject({ ok: false, error: expect.stringContaining("inválido") })
    expect(await runAgent({ agentId: "ollama", prompt: "x", resolve: resolveAll })).toMatchObject({ ok: false, error: expect.stringContaining("modelo") })
  })

  it("maps timeouts, aborts, truncation, auth failures and empty output", async () => {
    const run = (result, agentId = "gemini") => runAgent({ agentId, prompt: "x", resolve: resolveAll, exec: async () => okResult(result), timeoutMs: 30_000 })
    expect(await run({ timedOut: true, code: null })).toMatchObject({ ok: false, error: expect.stringContaining("30 s") })
    expect(await run({ aborted: true, code: null })).toMatchObject({ ok: false, error: "Cancelado." })
    expect(await run({ truncated: true, stdout: "long" })).toMatchObject({ ok: true, text: "long\n\n[salida recortada]" })
    expect(await run({ code: 1, stderr: "Please set an Auth method" })).toMatchObject({ ok: false, error: expect.stringContaining("no tiene sesión") })
    expect(await run({ code: 1, stderr: "boom" })).toMatchObject({ ok: false, error: "Gemini CLI terminó con error: boom" })
    expect(await run({ code: 0, stdout: "" })).toMatchObject({ ok: false, error: expect.stringContaining("no devolvió texto") })
    expect(await run({ code: 7 })).toMatchObject({ ok: false, error: "Gemini CLI terminó con error." })
  })

  it("treats a Claude error result as a failure even with exit code 0", async () => {
    const stdout = `${JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login" })}\n`
    const result = await runAgent({ agentId: "claude", prompt: "x", resolve: resolveAll, exec: async () => okResult({ stdout }) })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("claude auth login") })
  })

  it("reports a CLI that fails to start", async () => {
    const result = await runAgent({ agentId: "codex", prompt: "x", resolve: resolveAll, exec: async () => { throw new Error("spawn EACCES") } })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("EACCES") })
  })
})

describe("detectAgent", () => {
  it("reports a CLI that is not installed", async () => {
    expect(await detectAgent("codex", { resolve: () => null })).toMatchObject({ id: "codex", installed: false, loggedIn: null })
    expect(await detectAgent("nope", { resolve: () => null })).toMatchObject({ installed: false, detail: "Agente desconocido" })
  })

  it("reads version and login state with the CLI's own commands", async () => {
    const exec = async ({ args }) => args[0] === "--version" ? okResult({ stdout: "2.1.296 (Claude Code)" }) : okResult({ stdout: "{\"loggedIn\": true}" })
    expect(await detectAgent("claude", { resolve: () => "/bin/claude", exec })).toMatchObject({ installed: true, version: "2.1.296", loggedIn: true })
  })

  it("survives a CLI that crashes on --version or status", async () => {
    const exec = async () => { throw new Error("crash") }
    expect(await detectAgent("codex", { resolve: () => "/bin/codex", exec })).toMatchObject({ installed: true, version: null, loggedIn: null })
  })

  it("probes Gemini only when asked", async () => {
    const exec = async () => okResult({ stdout: "0.63.0" })
    expect(await detectAgent("gemini", { resolve: () => "/bin/gemini", exec })).toMatchObject({ loggedIn: null })
    expect(await detectAgent("gemini", { resolve: () => "/bin/gemini", exec, probe: true, runAgentImpl: async () => ({ ok: true, text: "OK" }) })).toMatchObject({ loggedIn: true })
    expect(await detectAgent("gemini", { resolve: () => "/bin/gemini", exec, probe: true, runAgentImpl: async () => ({ ok: false, authError: true, error: "Gemini CLI no tiene sesión iniciada" }) })).toMatchObject({ loggedIn: false })
    expect(await detectAgent("gemini", { resolve: () => "/bin/gemini", exec, probe: true, runAgentImpl: async () => ({ ok: false, error: "401 Unauthorized" }) })).toMatchObject({ loggedIn: false })
    expect(await detectAgent("gemini", { resolve: () => "/bin/gemini", exec, probe: true, runAgentImpl: async () => ({ ok: false, error: "quota" }) })).toMatchObject({ loggedIn: null, detail: "quota" })
  })
})

describe("createAgentRuntime", () => {
  it("caches detection and lists usable agents", async () => {
    let calls = 0
    let clock = 0
    const exec = async ({ command, args }) => {
      calls += 1
      if (args[0] === "--version") return okResult({ stdout: "1.0.0" })
      if (command.endsWith("codex")) return okResult({ code: 1, stderr: "Not logged in" })
      if (command.endsWith("ollama")) return okResult({ stdout: "NAME\nllama3.2 x\n" })
      return okResult({ stdout: "{\"loggedIn\": true}" })
    }
    const resolve = (name) => (name === "gemini" ? null : `/fake/${name}`)
    const runtime = createAgentRuntime({ exec, resolve, now: () => clock, cacheMs: 1000 })
    const agents = await runtime.status()
    expect(agents.map(({ id, installed, loggedIn }) => [id, installed, loggedIn])).toEqual([
      ["claude", true, true],
      ["codex", true, false],
      ["gemini", false, null],
      ["ollama", true, true],
    ])
    const firstCalls = calls
    expect(await runtime.usableAgents()).toEqual(["claude", "ollama"])
    expect(calls).toBe(firstCalls)
    clock = 5000
    await runtime.status()
    expect(calls).toBe(firstCalls * 2)
    await runtime.status({ fresh: true })
    expect(calls).toBe(firstCalls * 3)
  })

  it("remembers a Gemini probe between plain status calls and picks the first Ollama model", async () => {
    const execCalls = []
    const exec = async (options) => {
      execCalls.push(options)
      if (options.args[0] === "--version") return okResult({ stdout: "1.0.0" })
      if (options.args[0] === "list") return okResult({ stdout: "NAME\nmistral:7b x\n" })
      if (options.args[0] === "run") return okResult({ stdout: "hola" })
      return okResult({ stdout: "OK" })
    }
    const resolve = (name) => (name === "gemini" || name === "ollama" ? `/fake/${name}` : null)
    const runtime = createAgentRuntime({ exec, resolve, cacheMs: 0 })
    expect((await runtime.status({ probe: true })).find((agent) => agent.id === "gemini").loggedIn).toBe(true)
    expect((await runtime.status()).find((agent) => agent.id === "gemini").loggedIn).toBe(true)
    const result = await runtime.run("ollama", "hola")
    expect(result.ok).toBe(true)
    expect(execCalls.at(-1).args).toEqual(["run", "mistral:7b", "--nowordwrap"])
  })

  describe.skipIf(IS_WINDOWS)("with fake CLIs on PATH", () => {
    let fake
    beforeAll(async () => { fake = await makeFakePath() })
    afterAll(async () => { await fake.cleanup() })

    it("detects all four and runs each one end to end", async () => {
      const runtime = createAgentRuntime({ env: { PATH: fake.dir }, platform: process.platform, timeoutMs: 20_000 })
      const agents = await runtime.status({ fresh: true })
      expect(agents.map(({ id, installed, version, loggedIn }) => ({ id, installed, version, loggedIn }))).toEqual([
        { id: "claude", installed: true, version: "9.9.9-fake", loggedIn: true },
        { id: "codex", installed: true, version: "9.9.9-fake", loggedIn: true },
        { id: "gemini", installed: true, version: "9.9.9-fake", loggedIn: null },
        { id: "ollama", installed: true, version: "9.9.9", loggedIn: true },
      ])
      expect(await runtime.usableAgents()).toEqual(["claude", "codex", "gemini", "ollama"])

      for (const id of ["claude", "codex", "gemini", "ollama"]) {
        const chunks = []
        const result = await runtime.run(id, "Decí hola", { onChunk: (text) => chunks.push(text) })
        expect(result.ok, `${id}: ${result.error}`).toBe(true)
        expect(result.text).toContain(`${id} (fake) recibió: Decí hola`)
        expect(chunks.join("")).toContain("Decí hola")
      }
    })

    it("marks a logged-out CLI and turns its run error into a login hint", async () => {
      const previous = process.env.FAKE_LOGGED_OUT
      process.env.FAKE_LOGGED_OUT = "codex,gemini"
      try {
        const runtime = createAgentRuntime({ env: { PATH: fake.dir }, platform: process.platform })
        const agents = await runtime.status({ probe: true })
        expect(agents.find((agent) => agent.id === "codex").loggedIn).toBe(false)
        expect(agents.find((agent) => agent.id === "gemini").loggedIn).toBe(false)
        expect(await runtime.usableAgents()).toEqual(["claude", "ollama"])
        const result = await runtime.run("codex", "hola")
        expect(result).toMatchObject({ ok: false, error: expect.stringContaining("codex login") })
      } finally {
        if (previous === undefined) delete process.env.FAKE_LOGGED_OUT
        else process.env.FAKE_LOGGED_OUT = previous
      }
    })

    it("uses the configured Ollama model", async () => {
      const runtime = createAgentRuntime({ env: { PATH: fake.dir }, platform: process.platform, ollamaModel: "qwen2.5:7b" })
      const result = await runtime.run("ollama", "hola")
      expect(result.ok).toBe(true)
    })
  })
})
