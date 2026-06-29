import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type DeliveryStatus = "success" | "failed" | "filtered"

export interface WebhookDeliveryAttempt {
  id: string
  webhookId: string
  event: string
  deliveredAt: string
  durationMs: number
  responseStatus: number | null
  ok: boolean
  retried: boolean
  attempt: number
  status: DeliveryStatus
}

export type CreateWebhookDeliveryAttempt = Omit<WebhookDeliveryAttempt, "id">

// ── NEW TYPES ──────────────────────────────────────────────────────────

export interface WebhookDeliveryStats {
  webhookId: string
  totalDeliveries: number
  successCount: number
  failureCount: number
  successRate: number
  lastDeliveryAt: string | null
  lastSuccessAt: string | null
  avgLatencyMs: number
}

export interface DeliveryListOptions {
  status?: "success" | "failure"
  limit?: number
}

export interface DeliveryListItem {
  timestamp: string
  status: "success" | "failure"
  httpStatus: number | null
  latencyMs: number
  error: string | null
}

// ── EXISTING CODE (unchanged) ──────────────────────────────────────────

const DEFAULT_DELIVERY_LOG_PATH = join(process.cwd(), ".data", "webhook-delivery-log.jsonl")
const MAX_DELIVERY_LOG_ENTRIES = 200

let deliveryLogPath = process.env.WEBHOOK_DELIVERY_LOG_PATH || DEFAULT_DELIVERY_LOG_PATH

function ensureDeliveryLogStore(): void {
  const dir = dirname(deliveryLogPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(deliveryLogPath)) {
    writeFileSync(deliveryLogPath, "", "utf8")
  }
}

function isWebhookDeliveryAttempt(value: unknown): value is WebhookDeliveryAttempt {
  if (!value || typeof value !== "object") return false
  const attempt = value as Partial<WebhookDeliveryAttempt>

  return (
    typeof attempt.id === "string" &&
    typeof attempt.webhookId === "string" &&
    typeof attempt.event === "string" &&
    typeof attempt.deliveredAt === "string" &&
    typeof attempt.durationMs === "number" &&
    (typeof attempt.responseStatus === "number" || attempt.responseStatus === null) &&
    typeof attempt.ok === "boolean" &&
    typeof attempt.retried === "boolean" &&
    typeof attempt.attempt === "number" &&
    (attempt.status === "success" || attempt.status === "failed" || attempt.status === "filtered")
  )
}

function parseDeliveryAttempt(line: string): WebhookDeliveryAttempt | null {
  try {
    const parsed = JSON.parse(line) as unknown
    if (parsed && typeof parsed === "object" && !("attempt" in parsed)) {
      const withDefaultAttempt = { ...parsed, attempt: 1 }
      return isWebhookDeliveryAttempt(withDefaultAttempt) ? withDefaultAttempt : null
    }
    if (parsed && typeof parsed === "object" && !("status" in parsed)) {
      const withStatus = {
        ...parsed,
        status: (parsed as Record<string, unknown>).ok === true ? "success" : "failed",
      }
      return isWebhookDeliveryAttempt(withStatus) ? withStatus : null
    }
    return isWebhookDeliveryAttempt(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readDeliveryAttempts(): WebhookDeliveryAttempt[] {
  if (!existsSync(deliveryLogPath)) return []
  const raw = readFileSync(deliveryLogPath, "utf8").trim()
  if (!raw) return []

  return raw
    .split("\n")
    .map((line) => parseDeliveryAttempt(line))
    .filter((attempt): attempt is WebhookDeliveryAttempt => attempt !== null)
}

function writeDeliveryAttempts(attempts: WebhookDeliveryAttempt[]): void {
  ensureDeliveryLogStore()
  const tmpPath = `${deliveryLogPath}.${process.pid}.tmp`
  const jsonl = attempts.map((attempt) => JSON.stringify(attempt)).join("\n")
  writeFileSync(tmpPath, jsonl ? `${jsonl}\n` : "", "utf8")
  renameSync(tmpPath, deliveryLogPath)
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 20
  return Math.min(Math.max(Math.floor(limit), 1), MAX_DELIVERY_LOG_ENTRIES)
}

export function appendWebhookDeliveryAttempt(input: CreateWebhookDeliveryAttempt): WebhookDeliveryAttempt {
  const attempt: WebhookDeliveryAttempt = {
    id: `wha_${randomBytes(8).toString("hex")}`,
    ...input,
  }
  const attempts = [...readDeliveryAttempts(), attempt].slice(-MAX_DELIVERY_LOG_ENTRIES)
  writeDeliveryAttempts(attempts)
  return attempt
}

export function listWebhookDeliveryAttempts(webhookId: string, limit = 20): WebhookDeliveryAttempt[] {
  const cleanWebhookId = webhookId.trim()
  const max = clampLimit(limit)

  return readDeliveryAttempts()
    .filter((attempt) => attempt.webhookId === cleanWebhookId)
    .reverse()
    .slice(0, max)
}

// ── NEW FUNCTIONS ──────────────────────────────────────────────────────

/**
 * Compute aggregated delivery statistics for a single webhook.
 * Returns zeroed stats when the webhook has no delivery attempts.
 */
export function getWebhookDeliveryStats(webhookId: string): WebhookDeliveryStats {
  const cleanWebhookId = webhookId.trim()
  const attempts = readDeliveryAttempts().filter(
    (attempt) => attempt.webhookId === cleanWebhookId
  )

  const totalDeliveries = attempts.length

  if (totalDeliveries === 0) {
    return {
      webhookId: cleanWebhookId,
      totalDeliveries: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      lastDeliveryAt: null,
      lastSuccessAt: null,
      avgLatencyMs: 0,
    }
  }

  const successCount = attempts.filter((a) => a.status === "success").length
  const failureCount = attempts.filter((a) => a.status === "failed").length
  const successRate = totalDeliveries > 0 ? successCount / totalDeliveries : 0

  const sorted = [...attempts].sort(
    (a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime()
  )

  const lastDelivery = sorted[0]
  const lastSuccess = sorted.find((a) => a.status === "success")

  const totalLatency = attempts.reduce((sum, a) => sum + a.durationMs, 0)
  const avgLatencyMs = Math.round(totalLatency / totalDeliveries)

  return {
    webhookId: cleanWebhookId,
    totalDeliveries,
    successCount,
    failureCount,
    successRate: Math.round(successRate * 1000) / 1000,
    lastDeliveryAt: lastDelivery?.deliveredAt ?? null,
    lastSuccessAt: lastSuccess?.deliveredAt ?? null,
    avgLatencyMs,
  }
}

/**
 * List recent delivery attempts for a webhook, newest first.
 * Filterable by status (success or failure only).
 * Limit caps results (default 20, max 100).
 */
export function listWebhookDeliveries(
  webhookId: string,
  options: DeliveryListOptions = {}
): DeliveryListItem[] {
  const cleanWebhookId = webhookId.trim()
  const rawLimit = options.limit ?? 20
  const max = Math.min(Math.max(Math.floor(rawLimit), 1), 100)

  let attempts = readDeliveryAttempts().filter(
    (attempt) => attempt.webhookId === cleanWebhookId
  )

  if (options.status) {
    if (options.status === "success") {
      attempts = attempts.filter((a) => a.status === "success")
    } else if (options.status === "failure") {
      attempts = attempts.filter((a) => a.status === "failed")
    }
  }

  attempts.sort(
    (a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime()
  )

  return attempts.slice(0, max).map((a) => ({
    timestamp: a.deliveredAt,
    status: a.status === "success" ? "success" : "failure",
    httpStatus: a.responseStatus,
    latencyMs: a.durationMs,
    error:
      a.status === "failed"
        ? a.responseStatus !== null
          ? `HTTP ${a.responseStatus}`
          : "timeout"
        : null,
  }))
}

// ── TEST HELPERS (unchanged) ───────────────────────────────────────────

export function resetWebhookDeliveryLogForTests(): void {
  writeDeliveryAttempts([])
}

export function setWebhookDeliveryLogPathForTests(path: string): void {
  deliveryLogPath = path
}

export function resetWebhookDeliveryLogPathForTests(): void {
  deliveryLogPath = process.env.WEBHOOK_DELIVERY_LOG_PATH || DEFAULT_DELIVERY_LOG_PATH
}