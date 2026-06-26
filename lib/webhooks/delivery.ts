import { createHmac } from "node:crypto"
import { subscribeToSystemEvents, type PublishedSystemEvent } from "@/lib/events/system-events"
import { listWebhooksWithSecrets, type WebhookRegistration } from "@/lib/webhooks/store"

const WEBHOOK_TIMEOUT_MS = 5_000
const WEBHOOK_RETRY_DELAY_MS = 10_000

let retryDelayMs = WEBHOOK_RETRY_DELAY_MS

const globalState = globalThis as typeof globalThis & {
  __openStellarWebhookDeliveryRegistered__?: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
}

async function postWebhook(url: string, body: string, secret: string): Promise<boolean> {
  const controller = new AbortController()
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
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function deliverToWebhook(webhook: WebhookRegistration, body: string): Promise<void> {
  const delivered = await postWebhook(webhook.url, body, webhook.secret)
  if (delivered) return

  await sleep(retryDelayMs)
  await postWebhook(webhook.url, body, webhook.secret)
}

export async function deliverWebhookEvent(event: PublishedSystemEvent): Promise<void> {
  const matchingWebhooks = listWebhooksWithSecrets().filter((webhook) => webhook.events.includes(event.type))
  if (matchingWebhooks.length === 0) return

  const body = JSON.stringify({
    type: event.type,
    payload: event,
  })

  await Promise.all(matchingWebhooks.map((webhook) => deliverToWebhook(webhook, body)))
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
  retryDelayMs = ms
}

export function resetWebhookRetryDelayForTests(): void {
  retryDelayMs = WEBHOOK_RETRY_DELAY_MS
}
