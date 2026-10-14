import { describe, expect, it } from "vitest"
import { looksLikeSignature } from "@/lib/orchestration/events"
import { applyChatEvent, createTranscriptContext } from "@/lib/orchestration/transcript"
import { agentTaskSystemPrompt } from "@/lib/solana/agent-task-prompt"

const TX = `0x${"9c".repeat(32)}`
const ctx = () => createTranscriptContext({ makeId: () => "id", timeLabel: () => "10:00", friendlyError: (text) => text })
const receipt = (network: string, transaction: string) => ({ transaction, network, payer: null, amount: "10000", asset: "USDC", explorerUrl: "https://x.test" })

describe("network in the chat transcript", () => {
  it("tags Arc receipts with their network and leaves Solana receipts as they were", () => {
    const arc = applyChatEvent([], { type: "handoff", turnId: "t", fromName: "A", toName: "B", task: "x", amount: "0.01", receipt: receipt("eip155:5042002", TX) }, ctx())
    expect(arc[0]).toMatchObject({ kind: "receipt", network: "eip155:5042002", transaction: TX })
    const solana = applyChatEvent([], { type: "handoff", turnId: "t", fromName: "A", toName: "B", task: "x", amount: "0.01", receipt: receipt("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "5".repeat(88)) }, ctx())
    expect(solana[0]).not.toHaveProperty("network")
  })

  it("keeps the network of an approval request", () => {
    const base = { type: "approval" as const, token: "t", runId: "r", fromName: "A", toName: "B", task: "x", amount: "0.01", reason: "run" as const, capUsdc: "0.03", expiresAt: 1 }
    expect(applyChatEvent([], { ...base, network: "eip155:5042002" }, ctx())[0]).toMatchObject({ kind: "approval", network: "eip155:5042002" })
    expect(applyChatEvent([], base, ctx())[0]).not.toHaveProperty("network")
  })

  it("recognizes Arc transaction hashes as well as Solana signatures", () => {
    expect(looksLikeSignature(TX)).toBe(true)
    expect(looksLikeSignature("5".repeat(88))).toBe(true)
    expect(looksLikeSignature("0x1234")).toBe(false)
  })

  it("tells a paid agent which network paid it", () => {
    expect(agentTaskSystemPrompt("N", "R")).toContain("USDC on Solana devnet")
    expect(agentTaskSystemPrompt("N", "R", "Arc testnet")).toContain("USDC on Arc testnet")
  })
})
