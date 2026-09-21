import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { experimental_evaluate as evaluate } from "ai"

function loadDotEnv(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, "")
  }
}

loadDotEnv(resolve(process.cwd(), ".env.local"))

if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.error("AI_GATEWAY_API_KEY is not set. Add it to .env.local or the deployment environment.")
  process.exit(1)
}

const model = process.env.OPEN_STELLAR_JEV_MODEL || "typesafe-ai/jev"

const result = await evaluate({
  model,
  state: "Open Stellar should use JEV for typed evaluation checks.",
  questions: {
    configured: {
      type: "boolean",
      instructions: "Is this statement asking for a typed evaluation check?",
    },
    fit: {
      type: "choice",
      instructions: "Choose the best JEV use case for this statement.",
      criteria: {
        routing: "Classify or route work.",
        verification: "Verify a requirement or condition.",
        longform: "Generate long-form prose.",
      },
    },
  },
})

console.log(JSON.stringify({
  ok: true,
  model,
  answers: result.answers,
  usage: result.usage,
}, null, 2))
