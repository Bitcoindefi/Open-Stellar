import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createMemoryStore } from "@/lib/security/kv-store"
import { APPROVAL_TTL_MS, approvalKeyFromEnv, consumeApproval, createApprovalSigner } from "@/lib/orchestration/approval"

const key = Buffer.alloc(32, 7)
const request = { runId: "run-1", fromId: "orchestrator", fromName: "Supervisor", toId: "research", toName: "Investigador", task: "Find options", amountMicro: 10_000, reason: "run" as const }

describe("approval tokens", () => {
  it("round-trips a hire tied to its run", () => {
    const signer = createApprovalSigner(key)
    const { token, payload } = signer.issue(request, 1_000)
    expect(payload).toMatchObject({ ...request, v: 1, exp: 1_000 + APPROVAL_TTL_MS })
    const verified = signer.verify(token, "run-1", 2_000)
    expect(verified).toEqual({ ok: true, payload })
  })

  it("refuses a token from another run, an expired one, or a tampered one", () => {
    const signer = createApprovalSigner(key, 1_000)
    const { token } = signer.issue(request, 0)
    expect(signer.verify(token, "run-2", 10)).toEqual({ ok: false, error: "This approval belongs to a different conversation run." })
    expect(signer.verify(token, "run-1", 1_000)).toEqual({ ok: false, error: "This approval expired. Ask again to get a new one." })

    const [body, signature] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), amountMicro: 1 })).toString("base64url")
    expect(signer.verify(`${forged}.${signature}`, "run-1", 10).ok).toBe(false)
    expect(createApprovalSigner(Buffer.alloc(32, 8)).verify(token, "run-1", 10).ok).toBe(false)
    for (const bad of ["", "abc", "a.b.c", `${body}.`, "x".repeat(9000)]) expect(signer.verify(bad, "run-1", 10).ok).toBe(false)
  })

  it("refuses a signed body that is not an approval", () => {
    const signer = createApprovalSigner(key)
    const sign = (body: string) => `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`
    expect(signer.verify(sign(Buffer.from("not json").toString("base64url")), "run-1").ok).toBe(false)
    expect(signer.verify(sign(Buffer.from(JSON.stringify({ v: 2 })).toString("base64url")), "run-1").ok).toBe(false)
  })

  it("is single use", async () => {
    const store = createMemoryStore()
    const { payload } = createApprovalSigner(key).issue(request)
    expect(await consumeApproval(store, payload)).toBe(true)
    expect(await consumeApproval(store, payload)).toBe(false)
  })
})

describe("approvalKeyFromEnv", () => {
  it("prefers an explicit secret, then derives one from the wallet, else none", () => {
    const explicit = approvalKeyFromEnv({ ORCHESTRATOR_APPROVAL_SECRET: "a-long-enough-secret" })
    const derived = approvalKeyFromEnv({ ORCHESTRATOR_SOLANA_SECRET: "[1,2,3]" })
    expect(explicit).toHaveLength(32)
    expect(derived).toHaveLength(32)
    expect(explicit?.equals(derived as Buffer)).toBe(false)
    expect(approvalKeyFromEnv({ ORCHESTRATOR_APPROVAL_SECRET: "short" })).toBeNull()
    expect(approvalKeyFromEnv({})).toBeNull()
  })
})
