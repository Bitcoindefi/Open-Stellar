import http from "node:http"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createAgentRuntime } from "../src/agents.mjs"
import { MAX_PROMPT_CHARS, createRunnerServer, publicAgent, validateOrchestrateBody, validateRunBody } from "../src/server.mjs"
import { IS_WINDOWS, makeFakePath, readSse } from "./helpers.mjs"

const TOKEN = "test-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const APP = "https://agentic-city.vercel.app"

function fakeRuntime(overrides = {}) {
  const runs = []
  return {
    runs,
    status: async () => [
      { id: "claude", label: "Claude Code", installed: true, version: "2.1.0", loggedIn: true, loginHint: "claude auth login", path: "/secret/path" },
      { id: "codex", label: "Codex CLI", installed: true, version: "0.1.0", loggedIn: false, detail: "x", loginHint: "codex login" },
      { id: "ollama", label: "Ollama", installed: true, version: "0.1", loggedIn: true, models: ["llama3.2"] },
    ],
    usableAgents: async () => ["claude", "ollama"],
    run: async (agentId, prompt, { onChunk, signal } = {}) => {
      runs.push({ agentId, prompt, signal })
      onChunk?.("hola ")
      onChunk?.("mundo")
      return { ok: true, text: "hola mundo", durationMs: 5, truncated: false }
    },
    ...overrides,
  }
}

async function startRunner(options = {}) {
  const runtime = options.runtime ?? fakeRuntime()
  const runner = createRunnerServer({ token: TOKEN, port: 0, runtime, version: "0.1.0-test", ...options })
  const { port } = await runner.listen()
  return { runner, runtime, port, base: `http://127.0.0.1:${port}` }
}

/** Raw request so the test controls Host and Origin headers exactly. */
function rawRequest(port, { method = "GET", path = "/status", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = ""
      res.on("data", (chunk) => { data += chunk })
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

const auth = { authorization: `Bearer ${TOKEN}` }

describe("runner HTTP API", () => {
  let ctx
  beforeAll(async () => { ctx = await startRunner() })
  afterAll(async () => { await ctx.runner.close() })

  it("rejects requests without the pairing token", async () => {
    expect((await rawRequest(ctx.port)).status).toBe(401)
    expect((await rawRequest(ctx.port, { headers: { authorization: "Bearer nope" } })).status).toBe(401)
    expect((await rawRequest(ctx.port, { headers: { authorization: TOKEN } })).status).toBe(401)
  })

  it("returns the detected agents without local paths", async () => {
    const response = await rawRequest(ctx.port, { headers: { ...auth, origin: APP } })
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.runner).toMatchObject({ name: "agentic-city-runner", version: "0.1.0-test" })
    expect(body.agents).toHaveLength(3)
    expect(response.body).not.toContain("/secret/path")
    expect(body.agents[2].models).toEqual(["llama3.2"])
    expect(response.headers["access-control-allow-origin"]).toBe(APP)
    expect(response.headers.vary).toBe("Origin")
  })

  it("keeps CORS headers on a 401 so the app can tell 'not paired' from 'not running'", async () => {
    const response = await rawRequest(ctx.port, { headers: { origin: APP } })
    expect(response.status).toBe(401)
    expect(response.headers["access-control-allow-origin"]).toBe(APP)
  })

  it("refuses origins outside the allowlist, even with the token", async () => {
    for (const origin of ["https://evil.example", "https://agentic-city.vercel.app.evil.com", "http://agentic-city.vercel.app", "null"]) {
      const response = await rawRequest(ctx.port, { headers: { ...auth, origin } })
      expect(response.status, origin).toBe(403)
      expect(response.headers["access-control-allow-origin"]).toBeUndefined()
    }
  })

  it("refuses a Host that is not loopback (DNS rebinding)", async () => {
    const response = await rawRequest(ctx.port, { headers: { ...auth, host: `evil.example:${ctx.port}` } })
    expect(response.status).toBe(403)
    expect((await rawRequest(ctx.port, { headers: { ...auth, host: `localhost:${ctx.port}` } })).status).toBe(200)
  })

  it("answers the CORS and Private Network Access preflight for allowed origins", async () => {
    const response = await rawRequest(ctx.port, {
      method: "OPTIONS",
      path: "/run",
      headers: { origin: APP, "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type", "access-control-request-private-network": "true" },
    })
    expect(response.status).toBe(204)
    expect(response.headers["access-control-allow-private-network"]).toBe("true")
    expect(response.headers["access-control-allow-headers"]).toMatch(/Authorization/)
    expect(response.headers["access-control-allow-methods"]).toMatch(/POST/)

    const plain = await rawRequest(ctx.port, { method: "OPTIONS", path: "/run", headers: { origin: "http://localhost:3000" } })
    expect(plain.status).toBe(204)
    expect(plain.headers["access-control-allow-private-network"]).toBeUndefined()

    const denied = await rawRequest(ctx.port, { method: "OPTIONS", path: "/run", headers: { origin: "https://evil.example", "access-control-request-private-network": "true" } })
    expect(denied.status).toBe(403)
    expect(denied.headers["access-control-allow-private-network"]).toBeUndefined()

    expect((await rawRequest(ctx.port, { method: "OPTIONS", path: "/run" })).status).toBe(400)
  })

  it("streams a single run as SSE events", async () => {
    const response = await fetch(`${ctx.base}/run`, { method: "POST", headers: { ...auth, "content-type": "application/json", origin: APP }, body: JSON.stringify({ agent: "claude", prompt: "  hola  " }) })
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/)
    const events = await readSse(response)
    expect(events.map((event) => event.type)).toEqual(["start", "chunk", "chunk", "done"])
    expect(events.at(-1)).toMatchObject({ agent: "claude", text: "hola mundo", ms: 5 })
    expect(ctx.runtime.runs.at(-1).prompt).toBe("hola")
  })

  it("validates bodies, content type and size", async () => {
    const post = (path, body, headers = {}) => rawRequest(ctx.port, { method: "POST", path, headers: { ...auth, "content-type": "application/json", ...headers }, body })
    expect((await post("/run", JSON.stringify({ agent: "bash", prompt: "x" }))).status).toBe(400)
    expect((await post("/run", JSON.stringify({ agent: "claude", prompt: "" }))).status).toBe(400)
    expect((await post("/run", "{oops")).status).toBe(400)
    expect((await post("/run", "[1]")).status).toBe(400)
    expect((await post("/run", JSON.stringify({ agent: "claude", prompt: "x" }), { "content-type": "text/plain" })).status).toBe(415)
    expect((await post("/run", JSON.stringify({ agent: "claude", prompt: "x".repeat(70_000) }))).status).toBe(413)
    expect((await post("/orchestrate", JSON.stringify({ task: "" }))).status).toBe(400)
    expect((await post("/nope", "{}")).status).toBe(404)
    expect((await rawRequest(ctx.port, { path: "/run", headers: auth })).status).toBe(404)
  })

  it("streams an orchestration with the real orchestrator and the fake runtime", async () => {
    const response = await fetch(`${ctx.base}/orchestrate`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ task: "Decí hola" }) })
    const events = await readSse(response)
    // The fake runtime answers "hola mundo" to the planner, which is not JSON: fallback path.
    expect(events.map((event) => event.type)).toEqual(["start", "planning", "plan_fallback", "plan", "step_start", "chunk", "chunk", "step_done", "final", "done"])
    expect(events[0]).toMatchObject({ orchestrator: "claude", agents: ["claude", "ollama"] })
  })
})

describe("runner limits", () => {
  let ctx
  afterEach(async () => { await ctx?.runner.close() })

  it("answers 429 while the maximum number of runs is active and aborts runs whose client left", async () => {
    let release
    let seenSignal
    const runtime = fakeRuntime({
      run: (agentId, prompt, { signal }) => new Promise((resolve) => {
        seenSignal = signal
        release = () => resolve({ ok: true, text: "late", durationMs: 1, truncated: false })
        signal.addEventListener("abort", () => resolve({ ok: false, text: "", error: "Cancelado." }))
      }),
    })
    ctx = await startRunner({ runtime, maxActive: 1 })
    const controller = new AbortController()
    const first = fetch(`${ctx.base}/run`, { method: "POST", signal: controller.signal, headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ agent: "codex", prompt: "x" }) })
    const firstResponse = await first
    expect(firstResponse.status).toBe(200)
    const busy = await rawRequest(ctx.port, { method: "POST", path: "/run", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ agent: "codex", prompt: "y" }) })
    expect(busy.status).toBe(429)
    expect(JSON.parse(busy.body).error).toBe("busy")
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(seenSignal.aborted).toBe(true)
    expect(ctx.runner.api.active).toBe(0)
    release?.()
  })

  it("reports a failed run and an orchestrator crash as error events", async () => {
    const runtime = fakeRuntime({ run: async () => ({ ok: false, text: "", error: "Codex CLI no tiene sesión iniciada" }) })
    ctx = await startRunner({ runtime, orchestrateImpl: async () => { throw new Error("kaboom") } })
    const run = await readSse(await fetch(`${ctx.base}/run`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ agent: "codex", prompt: "x" }) }))
    expect(run.at(-1)).toMatchObject({ type: "error", agent: "codex", message: expect.stringContaining("sesión") })
    const orch = await readSse(await fetch(`${ctx.base}/orchestrate`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ task: "x" }) }))
    expect(orch).toEqual([{ type: "error", message: "kaboom" }])
  })

  it("accepts extra origins from the command line", async () => {
    ctx = await startRunner({ extraOrigins: ["http://localhost:3924"] })
    const response = await rawRequest(ctx.port, { headers: { ...auth, origin: "http://localhost:3924" } })
    expect(response.status).toBe(200)
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3924")
  })

  it("fails to listen on a busy port", async () => {
    ctx = await startRunner()
    const second = createRunnerServer({ token: TOKEN, port: ctx.port, runtime: fakeRuntime(), version: "x" })
    await expect(second.listen()).rejects.toMatchObject({ code: "EADDRINUSE" })
  })
})

describe.skipIf(IS_WINDOWS)("end to end with fake CLIs on PATH", () => {
  let fake
  let ctx
  beforeAll(async () => {
    fake = await makeFakePath(["claude", "codex", "gemini"])
    const runtime = createAgentRuntime({ env: { PATH: fake.dir }, platform: process.platform, timeoutMs: 20_000 })
    ctx = await startRunner({ runtime })
  })
  afterAll(async () => {
    await ctx.runner.close()
    await fake.cleanup()
  })

  it("plans with Claude, runs Codex and Gemini in parallel and synthesizes", async () => {
    const response = await fetch(`${ctx.base}/orchestrate`, { method: "POST", headers: { ...auth, "content-type": "application/json", origin: APP }, body: JSON.stringify({ task: "Explicá qué es x402 en una línea" }) })
    const events = await readSse(response)
    const types = events.map((event) => event.type)
    expect(types[0]).toBe("start")
    expect(events.find((event) => event.type === "plan").steps.map((step) => step.agent)).toEqual(["claude", "codex"])
    expect(types.filter((type) => type === "step_done")).toHaveLength(2)
    expect(events.find((event) => event.type === "final")).toMatchObject({ synthesized: true, text: "Respuesta final de claude (fake): junté 2 resultados." })
    expect(types.at(-1)).toBe("done")
  })
})

describe("body validation helpers", () => {
  it("validates /run bodies", () => {
    expect(validateRunBody({ agent: "claude", prompt: "hi" })).toEqual({ ok: true, value: { agent: "claude", prompt: "hi", model: undefined } })
    expect(validateRunBody({ agent: "ollama", prompt: "hi", model: "llama3.2" })).toMatchObject({ ok: true })
    expect(validateRunBody({ agent: "ollama", prompt: "hi", model: "--x" })).toEqual({ ok: false, error: "invalid_model" })
    expect(validateRunBody({ agent: 1, prompt: "hi" })).toEqual({ ok: false, error: "unknown_agent" })
    expect(validateRunBody({ agent: "claude", prompt: 5 })).toEqual({ ok: false, error: "empty_prompt" })
    expect(validateRunBody({ agent: "claude", prompt: "x".repeat(MAX_PROMPT_CHARS + 1) })).toEqual({ ok: false, error: "prompt_too_long" })
  })

  it("validates /orchestrate bodies", () => {
    expect(validateOrchestrateBody({ task: "t", agents: ["codex"], orchestrator: "codex" })).toEqual({ ok: true, value: { task: "t", agents: ["codex"], orchestrator: "codex" } })
    expect(validateOrchestrateBody({ task: "t", orchestrator: null })).toEqual({ ok: true, value: { task: "t", agents: undefined, orchestrator: undefined } })
    expect(validateOrchestrateBody({ task: "t", agents: "codex" })).toEqual({ ok: false, error: "unknown_agent" })
    expect(validateOrchestrateBody({ task: "t", agents: ["bash"] })).toEqual({ ok: false, error: "unknown_agent" })
    expect(validateOrchestrateBody({ task: "t", orchestrator: "bash" })).toEqual({ ok: false, error: "unknown_agent" })
    expect(validateOrchestrateBody({ task: "x".repeat(MAX_PROMPT_CHARS + 1) })).toEqual({ ok: false, error: "task_too_long" })
  })

  it("exposes only public agent fields", () => {
    expect(publicAgent({ id: "codex", label: "Codex CLI", installed: true, path: "/x", loggedIn: undefined })).toEqual({ id: "codex", label: "Codex CLI", installed: true, version: null, loggedIn: null })
  })
})
