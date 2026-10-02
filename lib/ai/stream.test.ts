import { describe, expect, it, vi } from "vitest"
import { tool } from "ai"
import { z } from "zod"
import { createChatModel, providerErrorMessage, streamAgentTurn, type AgentStreamEvent } from "@/lib/ai/stream"
import { emptyStep, errorStep, scriptedModel, textStep, toolStep } from "@/__tests__/helpers/mock-model"

describe("createChatModel", () => {
  it("builds an OpenAI-compatible chat model for each supported provider", () => {
    for (const provider of ["openrouter", "openai", "anthropic", "groq", "vercel-ai-gateway"] as const) {
      const model = createChatModel({ provider, model: "some/model", apiKey: "key-12345678" })
      expect(typeof model).toBe("object")
      expect((model as { modelId: string }).modelId).toBe("some/model")
      expect((model as { provider: string }).provider).toContain(provider)
    }
  })

  it("rejects an unknown provider", () => {
    expect(() => createChatModel({ provider: "nope" as never, model: "m", apiKey: "k" })).toThrow("Unsupported model provider.")
  })

  it("streams through the provider endpoint with the caller's key", async () => {
    const fetchMock = vi.fn(async () => new Response(
      'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"Hola"},"finish_reason":null}]}\n\n' +
      'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
      "data: [DONE]\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ))
    const model = createChatModel({ provider: "openrouter", model: "anthropic/claude", apiKey: "or-key-123456" }, fetchMock as unknown as typeof fetch)
    const result = await streamAgentTurn({ model, label: "OpenRouter", system: "s", prompt: "p", onEvent: () => {} })

    expect(result.text).toBe("Hola")
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
    const headers = new Headers(init.headers)
    expect(headers.get("authorization")).toBe("Bearer or-key-123456")
    expect(headers.get("x-title")).toBe("Agentic City")
  })
})

describe("providerErrorMessage", () => {
  it("keeps the wording friendlyProviderError understands", () => {
    expect(providerErrorMessage({ statusCode: 401 }, "OpenRouter")).toBe("OpenRouter rejected the request (HTTP 401).")
    expect(providerErrorMessage({ lastError: { statusCode: 429 } }, "Groq")).toBe("Groq rejected the request (HTTP 429).")
    expect(providerErrorMessage({ errors: [{ statusCode: 500 }, { statusCode: 402 }] }, "OpenAI")).toBe("OpenAI rejected the request (HTTP 402).")
    expect(providerErrorMessage({ cause: { statusCode: 404 } }, "Anthropic")).toBe("Anthropic rejected the request (HTTP 404).")
  })

  it("describes empty, slow and other failures", () => {
    expect(providerErrorMessage(new Error("No output generated."), "OpenAI")).toBe("OpenAI returned an empty response.")
    expect(providerErrorMessage(new Error("The operation was aborted due to timeout"), "OpenAI")).toBe("OpenAI took too long to answer. Try again.")
    expect(providerErrorMessage("socket hang up", "Groq")).toBe("Groq: socket hang up")
    expect(providerErrorMessage(null, "Groq")).toBe("Groq could not answer.")
  })
})

describe("streamAgentTurn", () => {
  it("streams text deltas as they arrive", async () => {
    const events: AgentStreamEvent[] = []
    const result = await streamAgentTurn({ model: scriptedModel([textStep("Hola ", "equipo")]), label: "OpenAI", system: "s", prompt: "p", onEvent: (event) => events.push(event) })

    expect(result).toEqual({ text: "Hola equipo", toolCalls: 0 })
    expect(events).toEqual([{ type: "text", delta: "Hola " }, { type: "text", delta: "equipo" }])
  })

  it("runs a tool and keeps going so the model can answer after it", async () => {
    const echo = tool({ description: "echo", inputSchema: z.object({ value: z.string() }), execute: async ({ value }) => `echo:${value}` })
    const events: AgentStreamEvent[] = []
    const model = scriptedModel([toolStep([{ id: "c1", name: "echo", input: { value: "x" } }]), textStep("done")])

    const result = await streamAgentTurn({ model, label: "OpenAI", system: "s", prompt: "p", tools: { echo }, onEvent: (event) => events.push(event) })

    expect(result).toEqual({ text: "done", toolCalls: 1 })
    expect(events).toEqual([
      { type: "tool-call", toolCallId: "c1", toolName: "echo", input: { value: "x" } },
      { type: "tool-result", toolCallId: "c1", toolName: "echo", output: "echo:x" },
      { type: "text", delta: "done" },
    ])
  })

  it("stops after a step when shouldStop says so", async () => {
    const echo = tool({ description: "echo", inputSchema: z.object({ value: z.string() }), execute: async () => "ok" })
    const model = scriptedModel([toolStep([{ id: "c1", name: "echo", input: { value: "x" } }]), textStep("never")])
    const result = await streamAgentTurn({ model, label: "OpenAI", system: "s", prompt: "p", tools: { echo }, shouldStop: () => true, onEvent: () => {} })

    expect(result.text).toBe("")
    expect(model.doStreamCalls).toHaveLength(1)
  })

  it("reports a tool that throws as a tool error", async () => {
    const broken = tool({
      description: "broken",
      inputSchema: z.object({ value: z.string().optional() }),
      execute: async (): Promise<string> => {
        throw new Error("kaput")
      },
    })
    const events: AgentStreamEvent[] = []
    const model = scriptedModel([toolStep([{ id: "c1", name: "broken", input: {} }]), textStep("sorry")])
    await streamAgentTurn({ model, label: "OpenAI", system: "s", prompt: "p", tools: { broken }, onEvent: (event) => events.push(event) })

    expect(events).toContainEqual({ type: "tool-error", toolCallId: "c1", toolName: "broken", error: "kaput" })
  })

  it("throws provider errors with friendly wording", async () => {
    await expect(streamAgentTurn({ model: scriptedModel([errorStep({ statusCode: 401, message: "no" })]), label: "OpenRouter", system: "s", prompt: "p", onEvent: () => {} }))
      .rejects.toThrow("OpenRouter rejected the request (HTTP 401).")
  })

  it("treats a turn with no text and no tools as an empty response", async () => {
    await expect(streamAgentTurn({ model: scriptedModel([emptyStep()]), label: "Groq", system: "s", prompt: "p", onEvent: () => {} }))
      .rejects.toThrow("Groq returned an empty response.")
  })
})
