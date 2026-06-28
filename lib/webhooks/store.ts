import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { WEBHOOK_EVENT_TYPES } from "./event-types"
import { normalizeFilters, type WebhookFilter } from "./filter"

export interface WebhookRegistration {
  id: string
  url: string
  events: string[]
  secret: string
  createdAt: string
  filters?: WebhookFilter[]
}

export type PublicWebhookRegistration = Omit<WebhookRegistration, "secret">

export interface CreateWebhookInput {
  url: unknown
  events: unknown
  filters?: unknown
}

const DEFAULT_WEBHOOKS_PATH = join(process.cwd(), ".data", "webhooks.json")

let webhooksPath = process.env.WEBHOOKS_DB_PATH || DEFAULT_WEBHOOKS_PATH

function ensureWebhookStore(): void {
  const dir = dirname(webhooksPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(webhooksPath)) {
    writeFileSync(webhooksPath, "[]\n", "utf8")
  }
}

function isWebhookRegistration(value: unknown): value is WebhookRegistration {
  if (!value || typeof value !== "object") return false
  const webhook = value as Partial<WebhookRegistration>
  return (
    typeof webhook.id === "string" &&
    typeof webhook.url === "string" &&
    Array.isArray(webhook.events) &&
    webhook.events.every((event) => typeof event === "string") &&
    typeof webhook.secret === "string" &&
    typeof webhook.createdAt === "string" &&
    (webhook.filters === undefined || Array.isArray(webhook.filters))
  )
}

function readWebhooks(): WebhookRegistration[] {
  if (!existsSync(webhooksPath)) return []
  const raw = readFileSync(webhooksPath, "utf8").trim()
  if (!raw) return []
  const parsed = JSON.parse(raw) as unknown
  return Array.isArray(parsed) ? parsed.filter(isWebhookRegistration) : []
}

function writeWebhooks(webhooks: WebhookRegistration[]): void {
  ensureWebhookStore()
  const tmpPath = `${webhooksPath}.${process.pid}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(webhooks, null, 2)}\n`, "utf8")
  renameSync(tmpPath, webhooksPath)
}

function toPublicWebhook(webhook: WebhookRegistration): PublicWebhookRegistration {
  const { secret: _secret, ...publicWebhook } = webhook
  return publicWebhook
}

function assertValidUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid webhook URL")
  const trimmed = value.trim()

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Invalid webhook URL")
    }
    return url.toString()
  } catch {
    throw new Error("Invalid webhook URL")
  }
}

function normalizeEvents(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Webhook events must be an array")

  const events = Array.from(
    new Set(
      value
        .filter((event): event is string => typeof event === "string")
        .map((event) => event.trim())
        .filter(Boolean),
    ),
  )

  if (events.length === 0) throw new Error("Webhook events must include at least one event type")

  const invalid = events.filter((e) => !(WEBHOOK_EVENT_TYPES as readonly string[]).includes(e))
  if (invalid.length > 0) {
    throw new Error(`Invalid webhook events: ${invalid.join(", ")}`)
  }

  return events
}

export function createWebhookRegistration(input: CreateWebhookInput): WebhookRegistration {
  const webhook: WebhookRegistration = {
    id: `wh_${randomBytes(8).toString("hex")}`,
    url: assertValidUrl(input.url),
    events: normalizeEvents(input.events),
    secret: randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
    filters: normalizeFilters(input.filters),
  }

  writeWebhooks([webhook, ...readWebhooks()])
  return webhook
}

export function listWebhooks(): PublicWebhookRegistration[] {
  return readWebhooks().map(toPublicWebhook)
}

export function listWebhooksWithSecrets(): WebhookRegistration[] {
  return readWebhooks()
}

export function rotateWebhookSecret(id: string): WebhookRegistration | null {
  const cleanId = id.trim()
  const webhooks = readWebhooks()
  const index = webhooks.findIndex((webhook) => webhook.id === cleanId)
  if (index === -1) return null

  const updated: WebhookRegistration = {
    ...webhooks[index],
    secret: randomBytes(32).toString("hex"),
  }
  const next = [...webhooks]
  next[index] = updated
  writeWebhooks(next)

  return updated
}

export function deleteWebhook(id: string): boolean {
  const cleanId = id.trim()
  const webhooks = readWebhooks()
  const next = webhooks.filter((webhook) => webhook.id !== cleanId)
  writeWebhooks(next)
  return next.length !== webhooks.length
}

// ── NEW: Get webhook by ID ─────────────────────────────────────────────

export function getWebhookById(id: string): WebhookRegistration | null {
  const cleanId = id.trim()
  return readWebhooks().find((webhook) => webhook.id === cleanId) || null
}

export function resetWebhookStoreForTests(): void {
  writeWebhooks([])
}

export function setWebhookStorePathForTests(path: string): void {
  webhooksPath = path
}

export function resetWebhookStorePathForTests(): void {
  webhooksPath = process.env.WEBHOOKS_DB_PATH || DEFAULT_WEBHOOKS_PATH
}