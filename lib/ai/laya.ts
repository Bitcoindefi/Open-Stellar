export const LAYA_DEFAULT_URL = "http://127.0.0.1:8788"

export type LayaQuestion = Record<string, unknown>

export interface LayaEvaluationInput {
  state: string
  questions: Record<string, LayaQuestion>
  lang?: string
}

export function layaUrl(): string | undefined {
  const value = process.env.OPEN_STELLAR_LAYA_URL?.trim()
  return value || undefined
}

export function isLayaConfigured(): boolean {
  return Boolean(layaUrl())
}

export async function evaluateWithLaya(input: LayaEvaluationInput) {
  const baseUrl = layaUrl()
  if (!baseUrl) throw new Error("Laya is not configured. Set OPEN_STELLAR_LAYA_URL to a local sidecar URL.")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || `Laya sidecar returned ${response.status}`)
    return payload
  } finally {
    clearTimeout(timeout)
  }
}
