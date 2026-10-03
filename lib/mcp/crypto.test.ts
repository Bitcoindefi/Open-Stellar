import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import {
  isCodeChallenge,
  isTokenOf,
  newDataKey,
  newToken,
  openSeed,
  sealSeed,
  serverSecrets,
  signHostedTask,
  tokenHash,
  unwrapDataKey,
  verifyHostedTask,
  verifyPkce,
  wrapDataKey,
} from "@/lib/mcp/crypto"

const GRANT = "f".repeat(32)

describe("MCP crypto", () => {
  const env = { ...process.env }
  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "mcp-crypto-secret"
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it("makes prefixed opaque tokens and stores only their hash", () => {
    const access = newToken("access")
    expect(isTokenOf("access", access)).toBe(true)
    expect(isTokenOf("refresh", access)).toBe(false)
    expect(isTokenOf("code", "acmc_short")).toBe(false)
    expect(isTokenOf("access", 42)).toBe(false)
    expect(tokenHash(access)).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash(access)).not.toContain(access)
    expect(newToken("client")).toMatch(/^mcpc_/)
  })

  it("verifies PKCE S256 and nothing else", () => {
    const verifier = "a".repeat(43)
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    expect(isCodeChallenge(challenge)).toBe(true)
    expect(isCodeChallenge("plain")).toBe(false)
    expect(verifyPkce(verifier, challenge)).toBe(true)
    expect(verifyPkce("b".repeat(43), challenge)).toBe(false)
    expect(verifyPkce(verifier.slice(0, 20), challenge)).toBe(false) // too short a verifier
    expect(verifyPkce(undefined, challenge)).toBe(false)
    expect(verifyPkce(verifier, verifier)).toBe(false) // a "plain" challenge does not pass
  })

  it("wraps the data key under a token: needs that token, that grant and that kind", () => {
    const key = newDataKey()
    const token = newToken("access")
    const wrapped = wrapDataKey(key, token, GRANT, "access")
    expect(unwrapDataKey(wrapped, token, GRANT, "access")?.equals(key)).toBe(true)
    expect(unwrapDataKey(wrapped, newToken("access"), GRANT, "access")).toBeNull()
    expect(unwrapDataKey(wrapped, token, "e".repeat(32), "access")).toBeNull()
    expect(unwrapDataKey(wrapped, token, GRANT, "refresh")).toBeNull()
    expect(unwrapDataKey({ ...wrapped, ct: Buffer.from("tampered").toString("base64url") }, token, GRANT, "access")).toBeNull()
  })

  it("needs the server secret too, and still opens after a rotation", () => {
    const key = newDataKey()
    const token = newToken("refresh")
    const wrapped = wrapDataKey(key, token, GRANT, "refresh")
    process.env.BETTER_AUTH_SECRET = "another-secret"
    expect(unwrapDataKey(wrapped, token, GRANT, "refresh")).toBeNull()
    process.env.CONNECTIONS_SECRET_PREVIOUS = "mcp-crypto-secret"
    expect(unwrapDataKey(wrapped, token, GRANT, "refresh")?.equals(key)).toBe(true)
    expect(serverSecrets()).toEqual(["another-secret", "mcp-crypto-secret"])
  })

  it("refuses to wrap without a server secret", () => {
    delete process.env.BETTER_AUTH_SECRET
    expect(() => wrapDataKey(newDataKey(), newToken("code"), GRANT, "code")).toThrow(/BETTER_AUTH_SECRET/)
    expect(() => signHostedTask({ agentId: "a", task: "t", ownerTag: null })).toThrow(/BETTER_AUTH_SECRET/)
  })

  it("seals the seed bound to the grant and address", () => {
    const key = newDataKey()
    const seed = new Uint8Array(32).fill(7)
    const sealed = sealSeed(key, seed, GRANT, "Addr1")
    expect(Array.from(openSeed(key, sealed, GRANT, "Addr1") ?? [])).toEqual(Array.from(seed))
    expect(openSeed(key, sealed, GRANT, "Addr2")).toBeNull()
    expect(openSeed(newDataKey(), sealed, GRANT, "Addr1")).toBeNull()
  })

  it("signs hosted tasks bound to agent, task, owner and time", () => {
    const now = 1_800_000_000_000
    const header = signHostedTask({ agentId: "researcher", task: "hola", ownerTag: "0123456789abcdef0123" }, now)
    expect(verifyHostedTask(header, { agentId: "researcher", task: "hola" }, now)).toEqual({ ownerTag: "0123456789abcdef0123" })
    expect(verifyHostedTask(header, { agentId: "writer", task: "hola" }, now)).toBeNull()
    expect(verifyHostedTask(header, { agentId: "researcher", task: "chau" }, now)).toBeNull()
    expect(verifyHostedTask(header, { agentId: "researcher", task: "hola" }, now + 301_000)).toBeNull()
    expect(verifyHostedTask(header.replace("0123456789abcdef0123", "1123456789abcdef0123"), { agentId: "researcher", task: "hola" }, now)).toBeNull()
    expect(verifyHostedTask(null, { agentId: "researcher", task: "hola" }, now)).toBeNull()
    expect(verifyHostedTask("garbage", { agentId: "researcher", task: "hola" }, now)).toBeNull()
    const anonymous = signHostedTask({ agentId: "researcher", task: "hola", ownerTag: null }, now)
    expect(verifyHostedTask(anonymous, { agentId: "researcher", task: "hola" }, now)).toEqual({ ownerTag: null })
  })
})
