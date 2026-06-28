#!/usr/bin/env node
/**
 * Passport ContractSpec integrity guard.
 *
 * Two PRs (#284, #358) attempted to silently corrupt the base64 `ContractSpec`
 * of the ZK passport validator inside lib/passport/validator-client.ts — a change
 * that compiles fine and passes typecheck/lint, but breaks proof construction at
 * runtime. This guard freezes the spec: it extracts the base64 entries, checks
 * each is valid base64, and compares a SHA-256 of the set against a known-good
 * value. Any change fails CI until someone deliberately updates EXPECTED_SHA256
 * (which should only happen on an intentional contract upgrade, in a reviewed PR).
 */
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const FILE = "lib/passport/validator-client.ts"
// Known-good hash of the validator ContractSpec base64 entries (joined with "|").
// Update ONLY on an intentional contract-spec upgrade.
const EXPECTED_SHA256 = "33023ba554ba20b1920043a14698d4ad182eb86611a7bdd9965767975b69a8cc"

function fail(msg) {
  console.error(`\n❌ passport-spec-guard: ${msg}\n`)
  console.error("If this change is an INTENTIONAL contract-spec upgrade, update")
  console.error("EXPECTED_SHA256 in scripts/check-passport-spec.mjs in the same PR.\n")
  process.exit(1)
}

let src
try {
  src = readFileSync(FILE, "utf8")
} catch {
  fail(`cannot read ${FILE}`)
}

const block = src.match(/new\s+ContractSpec\(\s*\[([\s\S]*?)\]\s*\)/)
if (!block) fail(`could not locate the ContractSpec([...]) array in ${FILE}`)

const specs = [...block[1].matchAll(/"([A-Za-z0-9+/=]+)"/g)].map((m) => m[1])
if (specs.length === 0) fail("no base64 spec entries found inside ContractSpec([...])")

// 1) Strict base64 validation (catches the literal-dot corruption of #284/#358).
for (const s of specs) {
  let roundtrip
  try {
    roundtrip = Buffer.from(s, "base64").toString("base64")
  } catch {
    roundtrip = null
  }
  if (roundtrip !== s) {
    fail(`invalid base64 in a ContractSpec entry (starts with "${s.slice(0, 32)}...")`)
  }
}

// 2) Freeze: the whole spec set must match the known-good hash.
const actual = createHash("sha256").update(specs.join("|")).digest("hex")
if (actual !== EXPECTED_SHA256) {
  fail(
    `ContractSpec changed.\n  expected sha256: ${EXPECTED_SHA256}\n  actual   sha256: ${actual}\n  entries: ${specs.length}`,
  )
}

console.log(`✅ passport-spec-guard: ${specs.length} ContractSpec entries valid and unchanged.`)
