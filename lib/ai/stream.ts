import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { stepCountIs, streamText, type LanguageModel, type StopCondition, type ToolSet } from "ai"
import { BYOK_PROVIDERS, type ByokModelConnection } from "@/lib/ai/byok-provider"

// Streaming generation with tools for every provider a user can connect.
// All five speak the OpenAI chat-completions dialect (Anthropic through its OpenAI SDK
// compatibility endpoint), so one AI SDK provider covers them and tool calls work the same way.

export const DEFAULT_MAX_OUTPUT_TOKENS = 2048
/** How many model steps one agent turn may take: enough to hire, read the answer and reply. */
export const DEFAULT_TOOL_STEPS = 6

export function createChatModel(connection: ByokModelConnection, fetchImpl?: typeof fetch): LanguageModel {
  const provider = BYOK_PROVIDERS[connection.provider]
  if (!provider) throw new Error("Unsupported model provider.")
  const headers: Record<string, string> = connection.provider === "openrouter"
    ? { "HTTP-Referer": "https://agentic-city.vercel.app", "X-Title": "Agentic City" }
    : {}
  return createOpenAICompatible({
    name: connection.provider,
    baseURL: provider.endpoint,
    apiKey: connection.apiKey,
    headers,
    includeUsage: true,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  }).chatModel(connection.model)
}

function statusCodeOf(error: unknown, depth = 0): number | null {
  if (!error || typeof error !== "object" || depth > 4) return null
  const record = error as { statusCode?: unknown; lastError?: unknown; cause?: unknown; errors?: unknown }
  if (typeof record.statusCode === "number") return record.statusCode
  if (Array.isArray(record.errors) && record.errors.length > 0) return statusCodeOf(record.errors.at(-1), depth + 1)
  return statusCodeOf(record.lastError, depth + 1) ?? statusCodeOf(record.cause, depth + 1)
}

/**
 * Same wording as `generateWithByokProvider`, so `friendlyProviderError` keeps turning it
 * into a short instruction for the person.
 */
export function providerErrorMessage(error: unknown, label: string): string {
  const status = statusCodeOf(error)
  if (status) return `${label} rejected the request (HTTP ${status}).`
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (/no output generated|empty response/i.test(message)) return `${label} returned an empty response.`
  if (/abort|timeout/i.test(message)) return `${label} took too long to answer. Try again.`
  return message ? `${label}: ${message.slice(0, 240)}` : `${label} could not answer.`
}

export type AgentStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool-error"; toolCallId: string; toolName: string; error: string }

export type AgentTurnOptions = {
  model: LanguageModel
  label: string
  system: string
  prompt: string
  tools?: ToolSet
  maxSteps?: number
  maxOutputTokens?: number
  /** Checked after each step: true ends the turn (e.g. an approval is now waiting on the person). */
  shouldStop?: () => boolean
  abortSignal?: AbortSignal
  onEvent: (event: AgentStreamEvent) => void
}

/**
 * Runs one agent turn and reports text and tool activity as it happens.
 *
 * With tools, the step cap is what lets the model speak after a tool returns: a run that stops
 * after one step calls the tool and never answers (pattern from CopilotKit/openbot, MIT,
 * server/src/copilot.ts). Errors are thrown with the provider wording above.
 */
export async function streamAgentTurn(options: AgentTurnOptions): Promise<{ text: string; toolCalls: number }> {
  const hasTools = Boolean(options.tools && Object.keys(options.tools).length > 0)
  const stops: StopCondition<ToolSet>[] = [stepCountIs(hasTools ? options.maxSteps ?? DEFAULT_TOOL_STEPS : 1)]
  if (options.shouldStop) {
    const shouldStop = options.shouldStop
    stops.push(() => shouldStop())
  }

  let text = ""
  let toolCalls = 0
  try {
    const result = streamText({
      model: options.model,
      system: options.system,
      prompt: options.prompt,
      ...(hasTools ? { tools: options.tools } : {}),
      stopWhen: stops,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      maxRetries: 1,
      abortSignal: options.abortSignal ?? AbortSignal.timeout(90_000),
      // Errors arrive as "error" parts below and are reported to the person; skip the SDK's console dump.
      onError: () => {},
    })
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          if (part.text) {
            text += part.text
            options.onEvent({ type: "text", delta: part.text })
          }
          break
        case "tool-call":
          toolCalls += 1
          options.onEvent({ type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, input: part.input })
          break
        case "tool-result":
          options.onEvent({ type: "tool-result", toolCallId: part.toolCallId, toolName: part.toolName, output: part.output })
          break
        case "tool-error":
          options.onEvent({
            type: "tool-error",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            error: part.error instanceof Error ? part.error.message : String(part.error),
          })
          break
        case "error":
          throw part.error
        default:
          break
      }
    }
  } catch (error) {
    throw new Error(providerErrorMessage(error, options.label))
  }

  if (!text.trim() && toolCalls === 0) throw new Error(`${options.label} returned an empty response.`)
  return { text, toolCalls }
}
