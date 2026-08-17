import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  validateStellarAddress,
  validateDbUrl,
  buildEnvContent,
  writeEnvFile,
  runWizard,
  DEFAULTS,
} from "../scripts/bootstrap.mjs"

// ── validateStellarAddress ──────────────────────────────────────────────────

describe("validateStellarAddress", () => {
  it("accepts a valid 56-char G... address", () => {
    const valid = "G" + "A".repeat(55)
    expect(validateStellarAddress(valid)).toBe(true)
  })

  it("rejects an address not starting with G", () => {
    expect(validateStellarAddress("A" + "A".repeat(55))).toBe(false)
  })

  it("rejects an address shorter than 56 chars", () => {
    expect(validateStellarAddress("G" + "A".repeat(50))).toBe(false)
  })

  it("rejects an address longer than 56 chars", () => {
    expect(validateStellarAddress("G" + "A".repeat(60))).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(validateStellarAddress(null)).toBe(false)
    expect(validateStellarAddress(undefined)).toBe(false)
    expect(validateStellarAddress(42)).toBe(false)
  })
})

// ── validateDbUrl ───────────────────────────────────────────────────────────

describe("validateDbUrl", () => {
  it("accepts postgres:// URLs", () => {
    expect(validateDbUrl("postgres://user:pass@host/db")).toBe(true)
  })

  it("accepts postgresql:// URLs", () => {
    expect(validateDbUrl("postgresql://localhost:5432/mydb")).toBe(true)
  })

  it("rejects non-postgres URLs", () => {
    expect(validateDbUrl("mysql://localhost/db")).toBe(false)
    expect(validateDbUrl("http://example.com")).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(validateDbUrl(null)).toBe(false)
    expect(validateDbUrl(undefined)).toBe(false)
  })
})

// ── buildEnvContent ─────────────────────────────────────────────────────────

describe("buildEnvContent", () => {
  const answers = {
    projectName: "stellar-city",
    network: "mainnet",
    databaseUrl: "postgresql://db.example.com/prod",
    adminWallet: "G" + "B".repeat(55),
  }

  it("produces all four env vars", () => {
    const content = buildEnvContent(answers)
    expect(content).toContain('NEXT_PUBLIC_APP_NAME="stellar-city"')
    expect(content).toContain('STELLAR_NETWORK="mainnet"')
    expect(content).toContain('DATABASE_URL="postgresql://db.example.com/prod"')
    expect(content).toContain(`ADMIN_WALLET_ADDRESS="${"G" + "B".repeat(55)}"`)
  })

  it("ends with a newline", () => {
    expect(buildEnvContent(answers).endsWith("\n")).toBe(true)
  })
})

// ── writeEnvFile ─────────────────────────────────────────────────────────────

describe("writeEnvFile", () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "open-stellar-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("writes .env.local with correct content", () => {
    const answers = {
      projectName: "test-app",
      network: "testnet",
      databaseUrl: "postgresql://localhost/testdb",
      adminWallet: "G" + "C".repeat(55),
    }
    const returned = writeEnvFile(answers, tmpDir)
    const written = readFileSync(join(tmpDir, ".env.local"), "utf8")

    expect(written).toBe(returned)
    expect(written).toContain('NEXT_PUBLIC_APP_NAME="test-app"')
    expect(written).toContain('STELLAR_NETWORK="testnet"')
    expect(written).toContain('DATABASE_URL="postgresql://localhost/testdb"')
    expect(written).toContain(`ADMIN_WALLET_ADDRESS="${"G" + "C".repeat(55)}"`)
  })
})

// ── runWizard (--yes / CI mode) ──────────────────────────────────────────────

describe("runWizard with --yes flag", () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "open-stellar-wizard-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("writes .env.local using defaults without prompting", async () => {
    const result = await runWizard({ yes: true, cwd: tmpDir })

    expect(result).not.toBeNull()
    expect(result.projectName).toBe(DEFAULTS.projectName)
    expect(result.network).toBe(DEFAULTS.network)
    expect(result.databaseUrl).toBe(DEFAULTS.databaseUrl)

    const written = readFileSync(join(tmpDir, ".env.local"), "utf8")
    expect(written).toContain(`NEXT_PUBLIC_APP_NAME="${DEFAULTS.projectName}"`)
    expect(written).toContain(`STELLAR_NETWORK="${DEFAULTS.network}"`)
    expect(written).toContain(`DATABASE_URL="${DEFAULTS.databaseUrl}"`)
  })

  it("produces .env.local with all four required keys", async () => {
    await runWizard({ yes: true, cwd: tmpDir })
    const written = readFileSync(join(tmpDir, ".env.local"), "utf8")

    for (const key of [
      "NEXT_PUBLIC_APP_NAME",
      "STELLAR_NETWORK",
      "DATABASE_URL",
      "ADMIN_WALLET_ADDRESS",
    ]) {
      expect(written).toContain(key)
    }
  })
})

// ── Full wizard with all valid inputs → correct .env content ─────────────────

describe("wizard produces correct .env content for all valid inputs", () => {
  it("buildEnvContent with valid inputs matches expected .env.local format", () => {
    const validWallet = "G" + "D".repeat(55)
    const answers = {
      projectName: "my-stellar-app",
      network: "testnet",
      databaseUrl: "postgresql://user:secret@db.host:5432/stellar",
      adminWallet: validWallet,
    }

    const content = buildEnvContent(answers)

    expect(content).toBe(
      `NEXT_PUBLIC_APP_NAME="my-stellar-app"\n` +
        `STELLAR_NETWORK="testnet"\n` +
        `DATABASE_URL="postgresql://user:secret@db.host:5432/stellar"\n` +
        `ADMIN_WALLET_ADDRESS="${validWallet}"\n`,
    )
  })
})
