import { describe, expect, it, vi } from "vitest"
import {
  RunnerRequestError,
  createSseParser,
  fetchRunnerStatus,
  messageForStatus,
  normalizeAgents,
  offlineMessage,
  runnerBaseUrl,
  streamRunner,
} from "@/lib/runner/client"
import type { RunnerEvent } from "@/lib/runner/events"

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345"

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } })
}

describe("fetchRunnerStatus", () => {
  it("calls 127.0.0.1 with the bearer token and returns the agents", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      ok: true,
      runner: { name: "agentic-city-runner", version: "0.1.0" },
      agents: [{ id: "claude", label: "Claude Code", installed: true, version: "2.1.0", loggedIn: true }],
    }))
    const status = await fetchRunnerStatus(7421, TOKEN, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(status).toEqual({ state: "ready", version: "0.1.0", agents: [{ id: "claude", label: "Claude Code", installed: true, version: "2.1.0", loggedIn: true }] })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://127.0.0.1:7421/status")
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it("asks for a probe and sends no header without a token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: "unauthorized" }))
    expect(await fetchRunnerStatus(7500, null, { fetchImpl: fetchImpl as unknown as typeof fetch, probe: true })).toEqual({ state: "unauthorized" })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://127.0.0.1:7500/status?probe=1")
    expect(init.headers).toEqual({})
  })

  it("maps a network failure to offline and other answers to an error", async () => {
    expect(await fetchRunnerStatus(7421, TOKEN, { fetchImpl: (async () => { throw new TypeError("Failed to fetch") }) as unknown as typeof fetch })).toEqual({ state: "offline" })
    expect(await fetchRunnerStatus(7421, TOKEN, { fetchImpl: (async () => jsonResponse(403, { error: "origin_not_allowed" })) as unknown as typeof fetch })).toMatchObject({ state: "error", message: expect.stringContaining("--origin") })
    expect(await fetchRunnerStatus(7421, TOKEN, { fetchImpl: (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch })).toMatchObject({ state: "error" })
    expect(await fetchRunnerStatus(7421, TOKEN, { fetchImpl: (async () => jsonResponse(200, { agents: "nope" })) as unknown as typeof fetch })).toEqual({ state: "ready", version: "", agents: [] })
  })

  it("gives up after the timeout", async () => {
    const fetchImpl = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
    })) as unknown as typeof fetch
    expect(await fetchRunnerStatus(7421, TOKEN, { fetchImpl, timeoutMs: 20 })).toEqual({ state: "offline" })
  })
})

describe("normalizeAgents", () => {
  it("keeps known agents and well-typed fields only", () => {
    expect(normalizeAgents([
      { id: "ollama", label: "Ollama", installed: true, version: 3, loggedIn: "yes", detail: "Sin modelos", loginHint: "ollama serve", models: ["llama3.2", 7] },
      { id: "bash", label: "Bash" },
      null,
      { id: "codex" },
    ])).toEqual([
      { id: "ollama", label: "Ollama", installed: true, version: null, loggedIn: null, detail: "Sin modelos", loginHint: "ollama serve", models: ["llama3.2"] },
      { id: "codex", label: "codex", installed: false, version: null, loggedIn: null },
    ])
    expect(normalizeAgents("x")).toEqual([])
  })
})

describe("createSseParser", () => {
  it("parses events split across chunks and skips comments and junk", () => {
    const events: RunnerEvent[] = []
    const parser = createSseParser((event) => events.push(event))
    parser.push(": ping\n\ndata: {\"type\":\"start\",\"agent\":\"claude\"}\n")
    parser.push("\ndata: {\"type\":\"chu")
    parser.push("nk\",\"text\":\"hola\"}\r\n\r\ndata: not json\n\ndata: {\"no\":\"type\"}\n\n")
    parser.push("data: {\"type\":\"done\"}")
    parser.end()
    expect(events).toEqual([{ type: "start", agent: "claude" }, { type: "chunk", text: "hola" }, { type: "done" }])
  })
})

describe("streamRunner", () => {
  it("posts JSON with the bearer token and streams events", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(["data: {\"type\":\"start\"}\n\n", "data: {\"type\":\"done\",\"text\":\"ok\"}\n\n"]))
    const events: RunnerEvent[] = []
    await streamRunner({ token: TOKEN, port: 7421 }, "/run", { agent: "claude", prompt: "hola" }, (event) => events.push(event), { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(events.map((event) => event.type)).toEqual(["start", "done"])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://127.0.0.1:7421/run")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" })
    expect(JSON.parse(String(init.body))).toEqual({ agent: "claude", prompt: "hola" })
  })

  it("throws a readable error when the runner is down or refuses", async () => {
    const down = (async () => { throw new TypeError("Failed to fetch") }) as unknown as typeof fetch
    await expect(streamRunner({ token: TOKEN, port: 7421 }, "/run", {}, () => {}, { fetchImpl: down })).rejects.toThrow(offlineMessage(7421))
    const busy = (async () => jsonResponse(429, { error: "busy", message: "Esperá." })) as unknown as typeof fetch
    await expect(streamRunner({ token: TOKEN, port: 7421 }, "/orchestrate", {}, () => {}, { fetchImpl: busy })).rejects.toMatchObject({ status: 429, message: "Esperá." })
    const unauthorized = (async () => jsonResponse(401, { error: "unauthorized" })) as unknown as typeof fetch
    await expect(streamRunner({ token: TOKEN, port: 7421 }, "/run", {}, () => {}, { fetchImpl: unauthorized })).rejects.toBeInstanceOf(RunnerRequestError)
  })
})

describe("messages", () => {
  it("explains each status in Spanish", () => {
    expect(runnerBaseUrl(7421)).toBe("http://127.0.0.1:7421")
    expect(messageForStatus(401, null)).toContain("link nuevo")
    expect(messageForStatus(429, null)).toContain("Esperá")
    expect(messageForStatus(400, { error: "empty_prompt" })).toContain("empty_prompt")
    expect(messageForStatus(413, null)).toContain("413")
    expect(messageForStatus(500, { message: "boom" })).toBe("boom")
    expect(messageForStatus(500, { error: "internal_error" })).toBe("internal_error")
    expect(messageForStatus(502, null)).toBe("El runner respondió 502.")
  })
})
