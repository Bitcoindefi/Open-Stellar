import { describe, expect, it } from "vitest"
import {
  RUNNER_DEFAULT_PORT,
  RUNNER_STORAGE_KEY,
  clearRunnerPairing,
  isValidRunnerPort,
  isValidRunnerToken,
  parsePairingHash,
  readRunnerPairing,
  writeRunnerPairing,
} from "@/lib/runner/pairing"

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345_-"
const fixed = () => new Date("2026-10-11T12:00:00.000Z")

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key) },
    setItem: (key, value) => { data.set(key, String(value)) },
  }
}

function throwingStorage(): Storage {
  const fail = () => { throw new Error("SecurityError") }
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail }
}

describe("parsePairingHash", () => {
  it("reads a bare token with the default port", () => {
    expect(parsePairingHash(`#${TOKEN}`, fixed)).toEqual({ token: TOKEN, port: RUNNER_DEFAULT_PORT, pairedAt: "2026-10-11T12:00:00.000Z" })
  })

  it("reads token and port parameters", () => {
    expect(parsePairingHash(`#token=${TOKEN}&port=7500`, fixed)).toMatchObject({ token: TOKEN, port: 7500 })
    expect(parsePairingHash(`token=${TOKEN}`, fixed)).toMatchObject({ port: RUNNER_DEFAULT_PORT })
  })

  it("rejects empty, short, odd tokens and bad ports", () => {
    expect(parsePairingHash("")).toBeNull()
    expect(parsePairingHash("#")).toBeNull()
    expect(parsePairingHash("#short")).toBeNull()
    expect(parsePairingHash(`#${TOKEN}<script>`)).toBeNull()
    expect(parsePairingHash(`#token=${TOKEN}&port=80`)).toBeNull()
    expect(parsePairingHash(`#token=${TOKEN}&port=abc`)).toBeNull()
    expect(parsePairingHash("#port=7421")).toBeNull()
  })

  it("validates tokens and ports", () => {
    expect(isValidRunnerToken(TOKEN)).toBe(true)
    expect(isValidRunnerToken(42)).toBe(false)
    expect(isValidRunnerPort(7421)).toBe(true)
    expect(isValidRunnerPort(70000)).toBe(false)
    expect(isValidRunnerPort("7421")).toBe(false)
  })
})

describe("pairing storage", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage()
    const pairing = { token: TOKEN, port: 7421, pairedAt: "x" }
    expect(writeRunnerPairing(pairing, storage)).toBe(true)
    expect(readRunnerPairing(storage)).toEqual(pairing)
    clearRunnerPairing(storage)
    expect(readRunnerPairing(storage)).toBeNull()
  })

  it("ignores corrupt or tampered values", () => {
    expect(readRunnerPairing(memoryStorage({ [RUNNER_STORAGE_KEY]: "{not json" }))).toBeNull()
    expect(readRunnerPairing(memoryStorage({ [RUNNER_STORAGE_KEY]: JSON.stringify({ token: "x", port: 7421 }) }))).toBeNull()
    expect(readRunnerPairing(memoryStorage({ [RUNNER_STORAGE_KEY]: JSON.stringify({ token: TOKEN, port: 7421 }) }))).toEqual({ token: TOKEN, port: 7421, pairedAt: "" })
  })

  it("survives blocked storage and a missing window", () => {
    expect(readRunnerPairing(throwingStorage())).toBeNull()
    expect(writeRunnerPairing({ token: TOKEN, port: 7421, pairedAt: "" }, throwingStorage())).toBe(false)
    expect(() => clearRunnerPairing(throwingStorage())).not.toThrow()
    expect(readRunnerPairing(null)).toBeNull()
    expect(writeRunnerPairing({ token: TOKEN, port: 7421, pairedAt: "" }, null)).toBe(false)
    // In node there is no window: the defaults fall back to "no storage".
    expect(readRunnerPairing()).toBeNull()
    expect(writeRunnerPairing({ token: TOKEN, port: 7421, pairedAt: "" })).toBe(false)
    expect(() => clearRunnerPairing()).not.toThrow()
  })
})
