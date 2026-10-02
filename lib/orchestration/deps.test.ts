import { generateKeyPairSync } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { createChatRunDeps, hireBaseUrl } from "@/lib/orchestration/deps"
import { resetOrchestratorSignerForTests } from "@/lib/orchestration/wallet"

function secretKeyJson(): string {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const d = Buffer.from(privateKey.export({ format: "jwk" }).d as string, "base64url")
  const x = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url")
  return JSON.stringify(Array.from(Buffer.concat([d, x])))
}

describe("hireBaseUrl", () => {
  it("uses the configured base URL, else the request origin", () => {
    expect(hireBaseUrl("https://agentic-city.vercel.app/api/connections/chat", {})).toBe("https://agentic-city.vercel.app")
    expect(hireBaseUrl("http://localhost:3000/api/connections/chat", { ORCHESTRATOR_X402_BASE_URL: "https://agentic-city.vercel.app/" })).toBe("https://agentic-city.vercel.app")
    expect(hireBaseUrl("http://localhost:3000/x", { ORCHESTRATOR_X402_BASE_URL: "javascript:alert(1)" })).toBe("http://localhost:3000")
  })
})

describe("createChatRunDeps", () => {
  afterEach(() => resetOrchestratorSignerForTests())

  it("switches hiring and approvals off without an orchestrator wallet", async () => {
    const deps = await createChatRunDeps("https://a.test/api/connections/chat", {})
    expect(deps.hire).toBeNull()
    expect(deps.approvals).toBeNull()
    expect(deps.priceMicro).toBe(10_000)
    expect(deps.caps).toEqual({ maxDepth: 2, maxPerRun: 4 })
    expect(deps.budget).toEqual({ perRunMicro: 50_000, perDayMicro: 500_000, hardDayMicro: 2_000_000 })
    expect(typeof deps.modelFor({ provider: "groq", model: "llama", apiKey: "gsk-12345678" })).toBe("object")
  })

  it("wires the wallet, the caps and approvals from the env", async () => {
    const deps = await createChatRunDeps("https://a.test/api/connections/chat", {
      ORCHESTRATOR_SOLANA_SECRET: secretKeyJson(),
      ORCHESTRATOR_MAX_USDC_PER_RUN: "0.02",
      SOLANA_DEVNET_RPC_URL: "https://api.devnet.solana.com",
    })
    expect(typeof deps.hire).toBe("function")
    expect(deps.approvals).not.toBeNull()
    expect(deps.budget.perRunMicro).toBe(20_000)
  })
})
