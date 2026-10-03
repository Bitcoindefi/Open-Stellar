import { describe, expect, it } from "vitest"
import { agentTaskSystemPrompt } from "@/lib/solana/agent-task-prompt"

describe("agentTaskSystemPrompt", () => {
  it("gives the agent its name, role and the Agentic City setting", () => {
    const prompt = agentTaskSystemPrompt("Investigador", "Finds sources")
    expect(prompt).toContain("You are Investigador, an AI agent working inside Agentic City")
    expect(prompt).toContain("Your role on the team: Finds sources.")
    expect(prompt).toContain("x402 is the HTTP 402 \"Payment Required\" protocol")
    expect(prompt).toContain("USDC on Solana devnet")
    expect(prompt).toContain("8004 is the agent identity and reputation registry on Solana")
    expect(prompt).toContain("Be concise")
    expect(prompt).toContain("Do not claim tool use")
  })
})
