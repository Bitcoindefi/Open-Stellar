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
      // Backfill legacy records without status
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

export function resetWebhookDeliveryLogForTests(): void {
  writeDeliveryAttempts([])
}

export function setWebhookDeliveryLogPathForTests(path: string): void {
  deliveryLogPath = path
}

export function resetWebhookDeliveryLogPathForTests(): void {
  deliveryLogPath = process.env.WEBHOOK_DELIVERY_LOG_PATH || DEFAULT_DELIVERY_LOG_PATH
}