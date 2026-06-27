#!/usr/bin/env node
// Interactive setup wizard for new Open Stellar deployments.
// Run via: npx open-stellar bootstrap [--yes]
import { createInterface } from "node:readline/promises"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULTS = {
  projectName: "my-open-stellar-app",
  network: "testnet",
  databaseUrl: "postgresql://localhost:5432/openstellar",
  adminWallet: "",
}

/** Returns true if addr is a valid Stellar G... public key (56 chars). */
export function validateStellarAddress(addr) {
  return typeof addr === "string" && addr.startsWith("G") && addr.length === 56
}

/** Returns true if url looks like a postgres connection string. */
export function validateDbUrl(url) {
  return typeof url === "string" && url.startsWith("postgres")
}

/** Builds the .env.local file content from wizard answers. */
export function buildEnvContent(answers) {
  return (
    `NEXT_PUBLIC_APP_NAME="${answers.projectName}"\n` +
    `STELLAR_NETWORK="${answers.network}"\n` +
    `DATABASE_URL="${answers.databaseUrl}"\n` +
    `ADMIN_WALLET_ADDRESS="${answers.adminWallet}"\n`
  )
}

/** Writes .env.local to `dir` (defaults to cwd) and returns the file content. */
export function writeEnvFile(answers, dir = process.cwd()) {
  const content = buildEnvContent(answers)
  writeFileSync(join(dir, ".env.local"), content, "utf8")
  return content
}

async function ask(rl, question, defaultVal = "") {
  const hint = defaultVal ? ` (default: ${defaultVal})` : ""
  const raw = await rl.question(`${question}${hint}: `)
  return raw.trim() || defaultVal
}

async function askNetwork(rl) {
  while (true) {
    const raw = await rl.question("Stellar network — [1] testnet  [2] mainnet  (default: 1): ")
    const choice = raw.trim() || "1"
    if (choice === "1" || choice.toLowerCase() === "testnet") return "testnet"
    if (choice === "2" || choice.toLowerCase() === "mainnet") return "mainnet"
    console.log('Please enter 1 (testnet) or 2 (mainnet).')
  }
}

/**
 * Runs the bootstrap wizard.
 *
 * @param {object} [opts]
 * @param {boolean}  [opts.yes=false] - Skip confirmations and use defaults (CI mode).
 * @param {string}   [opts.cwd]       - Directory to write .env.local into.
 * @returns {Promise<object|null>} The collected answers, or null if the user aborted.
 */
export async function runWizard({ yes = false, cwd = process.cwd() } = {}) {
  console.log("\n=== Open Stellar Bootstrap Wizard ===\n")

  const answers = { ...DEFAULTS }

  if (yes) {
    console.log("Running in CI mode (--yes). Using defaults:")
    console.log(`  Project name : ${answers.projectName}`)
    console.log(`  Network      : ${answers.network}`)
    console.log(`  Database URL : ${answers.databaseUrl}`)
    console.log(`  Admin wallet : (set ADMIN_WALLET_ADDRESS in .env.local before running)`)
    writeEnvFile(answers, cwd)
    console.log("\n.env.local written. Run: npm run dev\n")
    return answers
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    // Step 1 — project name
    answers.projectName = await ask(rl, "1. Project name", DEFAULTS.projectName)

    // Step 2 — network
    answers.network = await askNetwork(rl)

    // Step 3 — database URL (warn on bad format, but don't block)
    while (true) {
      const url = await ask(rl, "3. Database URL")
      if (!url) {
        console.log("   Database URL is required.")
        continue
      }
      if (!validateDbUrl(url)) {
        console.log("   Warning: URL does not look like a postgres:// connection string.")
      }
      answers.databaseUrl = url
      break
    }

    // Step 4 — admin wallet (re-prompt on invalid)
    while (true) {
      const wallet = await ask(rl, "4. Admin wallet address (Stellar G... public key)")
      if (validateStellarAddress(wallet)) {
        answers.adminWallet = wallet
        break
      }
      console.log("   Invalid Stellar address: must start with 'G' and be exactly 56 characters.")
    }

    // Step 5 — confirm
    console.log("\nSummary:")
    console.log(`  NEXT_PUBLIC_APP_NAME = ${answers.projectName}`)
    console.log(`  STELLAR_NETWORK      = ${answers.network}`)
    console.log(`  DATABASE_URL         = ${answers.databaseUrl}`)
    console.log(`  ADMIN_WALLET_ADDRESS = ${answers.adminWallet}`)

    const confirm = await ask(rl, "\nProceed? [Y/n]", "Y")
    if (confirm.toLowerCase() === "n") {
      console.log("Aborted.")
      return null
    }
  } finally {
    rl.close()
  }

  writeEnvFile(answers, cwd)
  console.log("\n.env.local written successfully!")
  console.log("\nNext steps:")
  console.log("  npm run dev\n")
  return answers
}

// Entry point — only runs when invoked directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const subcommand = process.argv[2]
  if (subcommand !== "bootstrap") {
    console.error("Usage: open-stellar bootstrap [--yes]")
    process.exit(1)
  }
  const yes = process.argv.includes("--yes")
  runWizard({ yes }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
