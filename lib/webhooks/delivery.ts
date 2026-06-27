import { createHmac } from "node:crypto"
import { subscribeToSystemEvents, type PublishedSystemEvent } from "@/lib/events/system-events"
import { appendWebhookDeliveryAttempt } from "@/lib/webhooks/delivery-log"
import {
  enqueueWebhookRetry,
  getDueWebhookRetryEntries,
  recordWebhookRetryFailure,
  removeWebhookRetryEntry,
} from "@/lib/webhooks/retry-store"
import { listWebhooksWithSecrets, type WebhookRegistration } from "@/lib/webhooks/store"
import { evaluateFilters } from "@/lib/webhooks/filter"

const WEBHOOK_TIMEOUT_MS = 5_000
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000]

export interface WebhookPayload {
  type: PublishedSystemEvent["type"]
  payload: PublishedSystemEvent
}

let retryDelaysMs = [...RETRY_DELAYS_MS]

const globalState = globalThis as typeof globalThis & {
  __openStellarWebhookDeliveryRegistered__?: boolean
}

type PendingRetry = {
  timeout: ReturnType<typeof setTimeout>
  resolve: (cancelled: boolean) => void
}

const pendingRetriesByWebhookId = new Map<string, Set<PendingRetry>>()

interface WebhookPostResult {
  durationMs: number
  responseStatus: number | null
  ok: boolean
  lastError?: string
}

function waitForPendingRetry(webhookId: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const pendingRetries = pendingRetriesByWebhookId.get(webhookId) ?? new Set<PendingRetry>()
    const pendingRetry: PendingRetry = {
      timeout: setTimeout(() => {
        pendingRetries.delete(pendingRetry)
        if (pendingRetries.size === 0) {
          pendingRetriesByWebhookId.delete(webhookId)
        }
        resolve(false)
      }, ms),
      resolve,
    }
    pendingRetries.add(pendingRetry)
    pendingRetriesByWebhookId.set(webhookId, pendingRetries)
  })
}

export function cancelPendingWebhookRetries(webhookId: string): number {
  const cleanWebhookId = webhookId.trim()
  const pendingRetries = pendingRetriesByWebhookId.get(cleanWebhookId)
  if (!pendingRetries) return 0

  const cancelledRetries = pendingRetries.size
  for (const pendingRetry of pendingRetries) {
    clearTimeout(pendingRetry.timeout)
    pendingRetry.resolve(true)
  }
  pendingRetriesByWebhookId.delete(cleanWebhookId)
  return cancelledRetries
}

export function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
}

async function postWebhook(url: string, body: string, secret: string): Promise<WebhookPostResult> {
  const controller = new AbortController()
  const startedAt = Date.now()
  const timeout = setTimeout(() => {
    controller.abort()
  }, WEBHOOK_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Open-Stellar-Signature": signWebhookBody(body, secret),
      },
      body,
      signal: controller.signal,
    })
    return {
      durationMs: Date.now() - startedAt,
      responseStatus: response.status,
      ok: response.ok,
      ...(response.ok ? {} : { lastError: `HTTP ${response.status}` }),
    }
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      responseStatus: null,
      ok: false,
      lastError: error instanceof Error ? error.message : "Webhook request failed",
    }
  } finally {
    clearTimeout(timeout)
  }
}

function recordDeliveryAttempt(
  webhook: WebhookRegistration,
  event: string,
  result: WebhookPostResult,
  retried: boolean,
  attempt: number,
  status: "success" | "failed" | "filtered",
): void {
  try {
    appendWebhookDeliveryAttempt({
      webhookId: webhook.id,
      event,
      deliveredAt: new Date().toISOString(),
      durationMs: result.durationMs,
      responseStatus: result.responseStatus,
      ok: result.ok,
      retried,
      attempt,
      status,
    })
  } catch {
    // Delivery should not depend on local log persistence.
  }
}

async function deliverToWebhook(webhook: WebhookRegistration, payload: WebhookPayload): Promise<void> {
  // ─── FILTER GATE ──────────────────────────────────────────────────
  const passes = evaluateFilters(webhook.filters, payload.payload)

  if (!passes) {
    recordDeliveryAttempt(
      webhook,
      payload.type,
      { durationMs: 0, responseStatus: null, ok: false },
      false,
      1,
      "filtered",
    )
    return
  }
  // ────────────────────────────────────────────────────────────────────

  const maxAttempts = retryDelaysMs.length + 1
  const body = JSON.stringify(payload)
  let lastError = "Webhook delivery failed"

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const cancelled = await waitForPendingRetry(webhook.id, retryDelaysMs[attempt - 2])
      if (cancelled) return
    }

    const result = await postWebhook(webhook.url, body, webhook.secret)
    recordDeliveryAttempt(
      webhook,
      payload.type,
      result,
      attempt > 1,
      attempt,
      result.ok ? "success" : "failed",
    )
    if (result.ok) return
    lastError = result.lastError ?? lastError
  }

  enqueueWebhookRetry(webhook.id, payload, lastError)
}

export async function deliverWebhookEvent(event: PublishedSystemEvent): Promise<void> {
  const matchingWebhooks = listWebhooksWithSecrets().filter((webhook) => webhook.events.includes(event.type))
  if (matchingWebhooks.length === 0) return

  const payload: WebhookPayload = {
    type: event.type,
    payload: event,
  }
  await Promise.all(matchingWebhooks.map((webhook) => deliverToWebhook(webhook, payload)))
}

export interface WebhookRetrySummary {
  ok: true
  processed: number
  succeeded: number
  failed: number
  dead: number
}

export async function processDueWebhookRetries(now = Date.now()): Promise<WebhookRetrySummary> {
  const entries = getDueWebhookRetryEntries(now)
  const webhooks = listWebhooksWithSecrets()
  const summary: WebhookRetrySummary = {
    ok: true,
    processed: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
  }

  for (const entry of entries) {
    summary.processed += 1
    const webhook = webhooks.find((candidate) => candidate.id === entry.webhookId)

    if (!webhook) {
      const updated = recordWebhookRetryFailure(entry.id, "Webhook not found", now)
      summary.failed += 1
      if (updated?.status === "dead") summary.dead += 1
      continue
    }

    const result = await postWebhook(webhook.url, JSON.stringify(entry.payload), webhook.secret)
    recordDeliveryAttempt(
      webhook,
      entry.payload.type,
      result,
      true,
      entry.attempts + 1,
      result.ok ? "success" : "failed",
    )

    if (result.ok) {
      removeWebhookRetryEntry(entry.id)
      summary.succeeded += 1
      continue
    }

    const updated = recordWebhookRetryFailure(
      entry.id,
      result.lastError ?? "Webhook delivery failed",
      now,
    )
    summary.failed += 1
    if (updated?.status === "dead") summary.dead += 1
  }

  return summary
}

export function registerWebhookDeliveryListener(): void {
  if (globalState.__openStellarWebhookDeliveryRegistered__) return
  globalState.__openStellarWebhookDeliveryRegistered__ = true

  subscribeToSystemEvents((event) => {
    void deliverWebhookEvent(event).catch(() => undefined)
  })
}

registerWebhookDeliveryListener()

export function setWebhookRetryDelayForTests(ms: number): void {
  retryDelaysMs = RETRY_DELAYS_MS.map(() => ms)
}

export function setWebhookRetryDelaysForTests(delaysMs: number[]): void {
  retryDelaysMs = [...delaysMs]
}

export function resetWebhookRetryDelayForTests(): void {
  retryDelaysMs = [...RETRY_DELAYS_MS]
}

export function resetWebhookRetryCancellationForTests(): void {
  for (const pendingRetries of pendingRetriesByWebhookId.values()) {
    for (const pendingRetry of pendingRetries) {
      clearTimeout(pendingRetry.timeout)
      pendingRetry.resolve(true)
    }
  }
  pendingRetriesByWebhookId.clear()
}
