import { experimental_evaluate as evaluate } from "ai"

export const JEV_MODEL = process.env.OPEN_STELLAR_JEV_MODEL || "typesafe-ai/jev"

export type JevQuestion =
  | { type: "boolean"; instructions: string; criteria?: { true?: string | null; false?: string | null } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: Array<string | null> }

export interface JevEvaluationInput {
  state: string
  questions: Record<string, JevQuestion>
  model?: string
}

export interface JevEvaluationOptions {
  apiKey?: string
}

export function isServerGatewayKeyEnabled(): boolean {
  return process.env.OPEN_STELLAR_ALLOW_SERVER_AI_GATEWAY_KEY === "true"
}

export function hasJevGatewayConfig(apiKey?: string): boolean {
  if (apiKey) return true
  if (!isServerGatewayKeyEnabled()) return Boolean(process.env.VERCEL_OIDC_TOKEN)
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}

export function isJevModel(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  return normalized === "jev" || normalized === "typesafe-ai/jev" || normalized.includes("/jev")
}

export async function evaluateWithJev(input: JevEvaluationInput, options: JevEvaluationOptions = {}) {
  if (!hasJevGatewayConfig(options.apiKey)) {
    throw new Error("A user AI Gateway key is required for JEV. Send it as x-ai-gateway-key or Authorization: Bearer <key>.")
  }

  return evaluate({
    model: (input.model || JEV_MODEL) as never,
    state: input.state,
    questions: input.questions,
    headers: options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : undefined,
  })
}

export async function summarizeTaskWithJev(task: string, options: JevEvaluationOptions = {}) {
  const result = await evaluateWithJev({
    state: task,
    questions: {
      actionable: {
        type: "boolean",
        instructions: "Does this task describe a concrete action the agent can perform?",
      },
      risk: {
        type: "choice",
        instructions: "Classify the operational risk of carrying out this task.",
        criteria: {
          low: "Routine task with limited side effects.",
          medium: "Task may affect state, billing, or user-visible behavior.",
          high: "Task may affect funds, credentials, production data, or irreversible operations.",
        },
      },
      ready: {
        type: "boolean",
        instructions: "Can the agent proceed without requesting more information?",
      },
    },
  }, options)

  return `JEV evaluation completed: ${JSON.stringify(result)}`
}
