export const BYOK_PROVIDERS = {
  "vercel-ai-gateway": { label: "Vercel AI Gateway", style: "openai", endpoint: "https://ai-gateway.vercel.sh/v1" },
  openai: { label: "OpenAI", style: "openai", endpoint: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", style: "anthropic", endpoint: "https://api.anthropic.com/v1" },
  groq: { label: "Groq", style: "openai", endpoint: "https://api.groq.com/openai/v1" },
  openrouter: { label: "OpenRouter", style: "openai", endpoint: "https://openrouter.ai/api/v1" },
} as const

export type ByokProviderId = keyof typeof BYOK_PROVIDERS

export type ByokModelConnection = {
  provider: ByokProviderId
  model: string
  apiKey: string
}

export async function generateWithByokProvider(
  connection: ByokModelConnection,
  system: string,
  prompt: string,
): Promise<string> {
  const provider = BYOK_PROVIDERS[connection.provider]
  if (!provider) throw new Error("Unsupported model provider.")

  if (provider.style === "anthropic") {
    const response = await fetch(`${provider.endpoint}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": connection.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: connection.model,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!response.ok) throw new Error(`${provider.label} rejected the request (HTTP ${response.status}).`)
    const data = await response.json() as { content?: Array<{ type?: string; text?: string }> }
    const text = data.content?.filter((part) => part.type === "text").map((part) => part.text || "").join("\n").trim()
    if (!text) throw new Error(`${provider.label} returned an empty response.`)
    return text
  }

  const response = await fetch(`${provider.endpoint}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${connection.apiKey}` },
    body: JSON.stringify({
      model: connection.model,
      max_tokens: 1200,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`${provider.label} rejected the request (HTTP ${response.status}).`)
  const data = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }
  const content = data.choices?.[0]?.message?.content
  const text = typeof content === "string" ? content.trim() : Array.isArray(content) ? content.map((part) => part.text || "").join("\n").trim() : ""
  if (!text) throw new Error(`${provider.label} returned an empty response.`)
  return text
}
