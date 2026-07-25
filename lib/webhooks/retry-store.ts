import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { WebhookPayload } from "@/lib/webhooks/delivery"

export type RetryEntry = {
  id: string
  webhookId: string
  payload: WebhookPayload
  attempts: number
  nextRetryAt: number
  lastError?: string
  createdAt: number
  status?: "pending" | "dead"
}

const DEFAULT_RETRY_STORE_PATH = join(process.cwd(), ".data", "webhook-retry-queue.json")
const MAX_RETRY_DELAY_MS = 3_600_000
export const MAX_WEBHOOK_RETRY_ATTEMPTS = 5

let retryStorePath = process.env.WEBHOOK_RETRY_STORE_PATH || DEFAULT_RETRY_STORE_PATH

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isWebhookPayload(value: unknown): value is WebhookPayload {
  return isRecord(value) && typeof value.type === "string" && isRecord(value.payload)
}

function isRetryEntry(value: unknown): value is RetryEntry {
  if (!isRecord(value)) return false

  return (
    typeof value.id === "string" &&
    typeof value.webhookId === "string" &&
    isWebhookPayload(value.payload) &&
    typeof value.attempts === "number" &&
    Number.isInteger(value.attempts) &&
    value.attempts >= 1 &&
    typeof value.nextRetryAt === "number" &&
    Number.isFinite(value.nextRetryAt) &&
    (value.lastError === undefined || typeof value.lastError === "string") &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    (value.status === undefined || value.status === "pending" || value.status === "dead")
  )
}

function ensureRetryStore(): void {
  const dir = dirname(retryStorePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(retryStorePath)) {
    writeFileSync(retryStorePath, "[]\n", "utf8")
  }
}

function readRetryEntries(): RetryEntry[] {
  if (!existsSync(retryStorePath)) return []
  const raw = readFileSync(retryStorePath, "utf8").trim()
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(isRetryEntry) : []
  } catch {
    return []
  }
}

function writeRetryEntries(entries: RetryEntry[]): void {
  ensureRetryStore()
  const tmpPath = `${retryStorePath}.${process.pid}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8")
  renameSync(tmpPath, retryStorePath)
}

function payloadEventId(payload: WebhookPayload): string | null {
  if (!isRecord(payload) || !isRecord(payload.payload)) return null
  return typeof payload.payload.id === "string" ? payload.payload.id : null
}

export function calculateWebhookRetryDelay(attempts: number): number {
  const safeAttempts = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0
  return Math.min(2 ** safeAttempts * 1_000, MAX_RETRY_DELAY_MS)
}

export function enqueueWebhookRetry(
  webhookId: string,
  payload: WebhookPayload,
  lastError?: string,
  now = Date.now(),
): RetryEntry {
  const entries = readRetryEntries()
  const eventId = payloadEventId(payload)
  const existingIndex = eventId === null
    ? -1
    : entries.findIndex((entry) => (
      entry.webhookId === webhookId &&
      entry.status !== "dead" &&
      payloadEventId(entry.payload) === eventId
    ))

  if (existingIndex !== -1) {
    const existing = entries[existingIndex]
    const updated: RetryEntry = {
      ...existing,
      payload,
      nextRetryAt: now + calculateWebhookRetryDelay(existing.attempts),
      lastError,
      status: "pending",
    }
    entries[existingIndex] = updated
    writeRetryEntries(entries)
    return updated
  }

  const entry: RetryEntry = {
    id: `whr_${randomBytes(8).toString("hex")}`,
    webhookId,
    payload,
    attempts: 1,
    nextRetryAt: now + calculateWebhookRetryDelay(1),
    ...(lastError === undefined ? {} : { lastError }),
    createdAt: now,
    status: "pending",
  }
  writeRetryEntries([...entries, entry])
  return entry
}

export function listWebhookRetryEntries(): RetryEntry[] {
  return readRetryEntries()
}

export function getDueWebhookRetryEntries(now = Date.now()): RetryEntry[] {
  return readRetryEntries().filter((entry) => (
    entry.status !== "dead" && entry.nextRetryAt <= now
  ))
}

export function recordWebhookRetryFailure(
  id: string,
  lastError: string,
  now = Date.now(),
): RetryEntry | null {
  const entries = readRetryEntries()
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) return null

  const attempts = entries[index].attempts + 1
  const dead = attempts >= MAX_WEBHOOK_RETRY_ATTEMPTS
  const updated: RetryEntry = {
    ...entries[index],
    attempts,
    nextRetryAt: dead ? now : now + calculateWebhookRetryDelay(attempts),
    lastError,
    status: dead ? "dead" : "pending",
  }
  entries[index] = updated
  writeRetryEntries(entries)
  return updated
}

export function removeWebhookRetryEntry(id: string): boolean {
  const entries = readRetryEntries()
  const next = entries.filter((entry) => entry.id !== id)
  if (next.length === entries.length) return false
  writeRetryEntries(next)
  return true
}

export function removePendingWebhookRetries(webhookId: string): number {
  const entries = readRetryEntries()
  const next = entries.filter((entry) => (
    entry.webhookId !== webhookId || entry.status === "dead"
  ))
  const removed = entries.length - next.length
  if (removed > 0) {
    writeRetryEntries(next)
  }
  return removed
}

export function getRetryEntryAgentId(entry: RetryEntry): string | null {
  const payload = entry.payload as unknown
  if (!isRecord(payload) || !isRecord(payload.payload)) return null
  return typeof payload.payload.agentId === "string" ? payload.payload.agentId : null
}

export function setWebhookRetryStorePathForTests(path: string): void {
  retryStorePath = path
}

export function resetWebhookRetryStorePathForTests(): void {
  retryStorePath = process.env.WEBHOOK_RETRY_STORE_PATH || DEFAULT_RETRY_STORE_PATH
}
