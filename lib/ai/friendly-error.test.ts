import { describe, expect, it } from "vitest"
import { friendlyProviderError } from "@/lib/ai/friendly-error"

describe("friendlyProviderError", () => {
  it("explains provider HTTP errors in Spanish with a next step", () => {
    expect(friendlyProviderError("OpenRouter rejected the request (HTTP 401).")).toContain("volvé a conectar")
    expect(friendlyProviderError("OpenAI rejected the key or request (HTTP 403).")).toBe("OpenAI rechazó la key. Revisala o volvé a cargarla.")
    expect(friendlyProviderError("OpenRouter rejected the request (HTTP 402).")).toContain("crédito")
    expect(friendlyProviderError("Groq rejected the request (HTTP 404).")).toContain("no encontró ese modelo")
    expect(friendlyProviderError("Anthropic rejected the request (HTTP 429).")).toContain("limitando")
    expect(friendlyProviderError("OpenRouter rejected the request (HTTP 500).")).toContain("HTTP 500")
    expect(friendlyProviderError("GitHub rejected the token (HTTP 401).")).toContain("GitHub rechazó")
  })

  it("covers connection and empty-answer errors and leaves others untouched", () => {
    expect(friendlyProviderError("Connect OpenRouter first.")).toContain("Modelos IA")
    expect(friendlyProviderError("Cross-site requests cannot use your connected accounts.")).toContain("directamente")
    expect(friendlyProviderError("OpenRouter returned an empty response.")).toContain("respondió vacío")
    expect(friendlyProviderError("Algo distinto")).toBe("Algo distinto")
  })
})
