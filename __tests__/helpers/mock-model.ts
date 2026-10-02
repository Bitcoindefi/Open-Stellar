import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"

// Scripted language models for tests: each entry is one model step (one doStream call).

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
}

type Chunk = Record<string, unknown>

function streamOf(chunks: Chunk[]) {
  return { stream: simulateReadableStream({ chunks: chunks as never[] }) }
}

export function textStep(...deltas: string[]) {
  return streamOf([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    ...deltas.map((delta) => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
  ])
}

export function toolStep(calls: Array<{ id: string; name?: string; input: unknown }>, leadText?: string) {
  return streamOf([
    { type: "stream-start", warnings: [] },
    ...(leadText ? [{ type: "text-start", id: "l" }, { type: "text-delta", id: "l", delta: leadText }, { type: "text-end", id: "l" }] : []),
    ...calls.map((call) => ({ type: "tool-call", toolCallId: call.id, toolName: call.name ?? "message_agent", input: JSON.stringify(call.input) })),
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
  ])
}

export function errorStep(error: unknown) {
  return streamOf([{ type: "stream-start", warnings: [] }, { type: "error", error }])
}

export function emptyStep() {
  return streamOf([{ type: "stream-start", warnings: [] }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }])
}

export function scriptedModel(steps: Array<ReturnType<typeof streamOf>>) {
  return new MockLanguageModelV4({ doStream: steps as never })
}
