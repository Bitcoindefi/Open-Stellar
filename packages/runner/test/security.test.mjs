import { describe, expect, it } from "vitest"
import {
  DEFAULT_ORIGINS,
  generateToken,
  isAllowedHost,
  isAllowedOrigin,
  isValidToken,
  normalizeOrigin,
  pairingLink,
  readBearer,
  tokensMatch,
} from "../src/security.mjs"

describe("origins", () => {
  it("allows the app, its aliases and local dev", () => {
    for (const origin of DEFAULT_ORIGINS) expect(isAllowedOrigin(origin)).toBe(true)
    expect(isAllowedOrigin("https://agentic-city.vercel.app")).toBe(true)
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true)
  })

  it("allows the project's own Vercel deployment URLs only", () => {
    expect(isAllowedOrigin("https://open-stellar-qhjcfo9py-leocagli.vercel.app")).toBe(true)
    expect(isAllowedOrigin("https://open-stellar-qhjcfo9py-x-leocagli.vercel.app")).toBe(false)
    expect(isAllowedOrigin("https://open-stellar-git-main-leocagli.vercel.app")).toBe(false)
    expect(isAllowedOrigin("https://open-stellar-qhjcfo9py-leocagli.vercel.app.evil.com")).toBe(false)
  })

  it("rejects look-alikes, other schemes and empty values", () => {
    for (const origin of ["https://agentic-city.vercel.app.evil.com", "https://evil-agentic-city.vercel.app", "http://agentic-city.vercel.app", "http://localhost:3001", "null", "", undefined]) {
      expect(isAllowedOrigin(origin)).toBe(false)
    }
  })

  it("accepts extra origins passed on the command line", () => {
    expect(isAllowedOrigin("http://localhost:3924", ["http://localhost:3924"])).toBe(true)
  })

  it("normalizes origins", () => {
    expect(normalizeOrigin("https://example.com/path?x=1")).toBe("https://example.com")
    expect(normalizeOrigin("ftp://example.com")).toBeNull()
    expect(normalizeOrigin("not a url")).toBeNull()
  })
})

describe("host header", () => {
  it("only accepts loopback names on the runner's port", () => {
    expect(isAllowedHost("127.0.0.1:7421", 7421)).toBe(true)
    expect(isAllowedHost("LOCALHOST:7421", 7421)).toBe(true)
    expect(isAllowedHost("[::1]:7421", 7421)).toBe(true)
    expect(isAllowedHost("127.0.0.1:7422", 7421)).toBe(false)
    expect(isAllowedHost("attacker.example:7421", 7421)).toBe(false)
    expect(isAllowedHost(undefined, 7421)).toBe(false)
  })
})

describe("token", () => {
  it("generates long random url-safe tokens", () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
    expect(isValidToken(a)).toBe(true)
    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(isValidToken("short")).toBe(false)
    expect(isValidToken("x".repeat(30) + "!")).toBe(false)
    expect(isValidToken(null)).toBe(false)
  })

  it("reads bearer headers", () => {
    expect(readBearer("Bearer abc")).toBe("abc")
    expect(readBearer("bearer   abc ")).toBe("abc")
    expect(readBearer("Basic abc")).toBeNull()
    expect(readBearer("Bearer a b")).toBeNull()
    expect(readBearer(undefined)).toBeNull()
  })

  it("compares tokens in constant time", () => {
    expect(tokensMatch("abc", "abc")).toBe(true)
    expect(tokensMatch("abc", "abd")).toBe(false)
    expect(tokensMatch("abc", "abcd")).toBe(false)
    expect(tokensMatch("abc", null)).toBe(false)
    expect(tokensMatch("", "")).toBe(false)
  })
})

describe("pairing link", () => {
  it("puts the token in the URL hash so it never reaches a server", () => {
    expect(pairingLink("https://agentic-city.vercel.app/", "tok", 7421, 7421)).toBe("https://agentic-city.vercel.app/runner#tok")
    expect(pairingLink("http://localhost:3000", "tok", 7500, 7421)).toBe("http://localhost:3000/runner#token=tok&port=7500")
  })
})
