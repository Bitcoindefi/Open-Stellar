import { afterEach, describe, expect, it, vi } from "vitest"
import { BYOK_PROVIDERS, generateWithByokProvider } from "@/lib/ai/byok-provider"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("generateWithByokProvider", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("calls the Anthropic Messages API with the caller's key and joins text blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: "text", text: "Hola" }, { type: "tool_use" }, { type: "text", text: "equipo" }] }))
    vi.stubGlobal("fetch", fetchMock)

    const text = await generateWithByokProvider({ provider: "anthropic", model: "claude-opus-5", apiKey: "caller-key" }, "system prompt", "user prompt")

    expect(text).toBe("Hola\nequipo")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.anthropic.com/v1/messages")
    expect(init.headers["x-api-key"]).toBe("caller-key")
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ model: "claude-opus-5", system: "system prompt", messages: [{ role: "user", content: "user prompt" }] })
  })

  it("reports Anthropic HTTP errors and empty answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)))
    await expect(generateWithByokProvider({ provider: "anthropic", model: "m", apiKey: "k" }, "s", "p")).rejects.toThrow("Anthropic rejected the request (HTTP 401).")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [] })))
    await expect(generateWithByokProvider({ provider: "anthropic", model: "m", apiKey: "k" }, "s", "p")).rejects.toThrow("Anthropic returned an empty response.")
  })

  it("calls OpenAI-compatible providers with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "  listo  " } }] }))
    vi.stubGlobal("fetch", fetchMock)

    const text = await generateWithByokProvider({ provider: "openrouter", model: "x-ai/grok-4", apiKey: "or-key" }, "sys", "hi")

    expect(text).toBe("listo")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BYOK_PROVIDERS.openrouter.endpoint}/chat/completions`)
    expect(init.headers.authorization).toBe("Bearer or-key")
    expect(JSON.parse(init.body).messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "hi" }])
  })

  it("accepts array content parts from OpenAI-compatible providers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: [{ text: "uno" }, { text: "dos" }] } }] })))
    await expect(generateWithByokProvider({ provider: "groq", model: "m", apiKey: "k" }, "s", "p")).resolves.toBe("uno\ndos")
  })

  it("reports OpenAI-compatible HTTP errors and empty answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 429)))
    await expect(generateWithByokProvider({ provider: "openai", model: "m", apiKey: "k" }, "s", "p")).rejects.toThrow("OpenAI rejected the request (HTTP 429).")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] })))
    await expect(generateWithByokProvider({ provider: "openai", model: "m", apiKey: "k" }, "s", "p")).rejects.toThrow("OpenAI returned an empty response.")
  })

  it("rejects unknown providers before any network call", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    // @ts-expect-error: runtime guard for values that bypass the type system
    await expect(generateWithByokProvider({ provider: "custom", model: "m", apiKey: "k" }, "s", "p")).rejects.toThrow("Unsupported model provider.")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
