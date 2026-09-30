import { NextResponse } from "next/server"
import { evaluateWithJev, isJevModel } from "@/lib/ai/jev"
import { isAuthorized } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MODEL_PROVIDERS = {
  "vercel-ai-gateway": {
    label: "Vercel AI Gateway",
    url: "https://ai-gateway.vercel.sh/v1/models",
    auth: "bearer",
  },
  openai: { label: "OpenAI", url: "https://api.openai.com/v1/models", auth: "bearer" },
  anthropic: { label: "Anthropic", url: "https://api.anthropic.com/v1/models", auth: "anthropic" },
  groq: { label: "Groq", url: "https://api.groq.com/openai/v1/models", auth: "bearer" },
  openrouter: { label: "OpenRouter", url: "https://openrouter.ai/api/v1/models", auth: "bearer" },
} as const

const CONNECTORS = {
  github: { label: "GitHub", url: "https://api.github.com/user", auth: "bearer" },
  slack: { label: "Slack", url: "https://slack.com/api/auth.test", auth: "bearer" },
  discord: { label: "Discord", url: "https://discord.com/api/users/@me", auth: "bot" },
} as const

type ModelProvider = keyof typeof MODEL_PROVIDERS
type Connector = keyof typeof CONNECTORS

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8 && value.length <= 8192
}

export async function POST(req: Request) {
  const path = new URL(req.url).pathname
  if (path.startsWith("/api/admin/") && !isAuthorized(req)) return response({ ok: false, error: "Unauthorized" }, 401)

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !isKey(body.apiKey)) return response({ ok: false, error: "Enter a valid API key or token." }, 400)

  const apiKey = body.apiKey.trim()
  const kind = body.kind

  try {
    if (kind === "model") {
      const provider = body.provider as ModelProvider
      const config = MODEL_PROVIDERS[provider]
      if (!config) return response({ ok: false, error: "Unsupported model provider." }, 400)

      if (provider === "vercel-ai-gateway" && isJevModel(String(body.model || ""))) {
        await evaluateWithJev({
          state: "Connection check. Reply with the provided boolean result.",
          model: String(body.model),
          questions: { connected: { type: "boolean", instructions: "Is this a connection test?", criteria: { true: "Yes", false: "No" } } },
        }, { apiKey })
        return response({ ok: true, connected: true, provider: config.label, model: body.model })
      }

      const headers: Record<string, string> = config.auth === "anthropic"
        ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${apiKey}` }
      const upstream = await fetch(config.url, { headers, signal: AbortSignal.timeout(10_000) })
      if (!upstream.ok) {
        return response({ ok: false, error: `${config.label} rejected the key or request (HTTP ${upstream.status}).` }, 400)
      }

      const data = await upstream.json().catch(() => ({})) as { data?: Array<{ id?: string; name?: string }>; models?: Array<{ id?: string; name?: string }> }
      const modelIds = [...(data.data ?? []), ...(data.models ?? [])]
        .map((item) => item.id || item.name || "")
        .filter(Boolean)
      const model = typeof body.model === "string" ? body.model.trim() : ""
      return response({
        ok: true,
        connected: true,
        provider: config.label,
        modelCount: modelIds.length,
        modelAvailable: model ? modelIds.includes(model) : undefined,
      })
    }

    if (kind === "connector") {
      const connector = body.connector as Connector
      const config = CONNECTORS[connector]
      if (!config) return response({ ok: false, error: "Unsupported connector." }, 400)

      const headers: Record<string, string> = connector === "discord"
        ? { Authorization: `Bot ${apiKey}` }
        : { Authorization: `Bearer ${apiKey}` }
      headers.Accept = "application/json"
      headers["User-Agent"] = "AgenticCity-ConnectorCheck"

      const upstream = await fetch(config.url, { headers, signal: AbortSignal.timeout(10_000) })
      if (!upstream.ok) {
        return response({ ok: false, error: `${config.label} rejected the token (HTTP ${upstream.status}).` }, 400)
      }
      const result = await upstream.json().catch(() => ({})) as { ok?: boolean }
      if (connector === "slack" && result.ok === false) {
        return response({ ok: false, error: "Slack rejected the token. Check the bot token and auth.test scope." }, 400)
      }
      return response({ ok: true, connected: true, connector: config.label })
    }

    return response({ ok: false, error: "Connection type must be model or connector." }, 400)
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    return response({ ok: false, error: timedOut ? "Provider check timed out." : "Could not verify this connection. Check the key and try again." }, 502)
  }
}
