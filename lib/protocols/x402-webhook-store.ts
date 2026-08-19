import { createHmac, randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { cwd } from 'node:process'
import type { X402ExplorerReceipt, X402Receipt } from '@/lib/protocols/x402'
import { makeJsonStore } from '@/lib/protocols/x402-store-utils'

export interface X402Webhook {
  id: string
  serviceId: string
  url: string
  secret: string
  active: boolean
  createdAt: string
}

export interface X402WebhookDelivery {
  id: string
  webhookId: string
  url: string
  receiptId: string
  status: number
  success: boolean
  deliveredAt: string
  error?: string
}

const DB_PATH = process.env.X402_WEBHOOK_DB_PATH ?? join(cwd(), '.data', 'x402-webhooks.json')
const store = makeJsonStore<X402Webhook>(DB_PATH)

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim()
  if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1' || host === '::1' || host === '::') {
    return true
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
  }
  return false
}

/** Only public HTTPS endpoints are accepted to prevent SSRF to internal/local services. */
function validateWebhookUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('Invalid webhook URL')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS')
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new Error('Webhook URL cannot target local or private network addresses')
  }
  return parsed
}

export function readWebhooks(): X402Webhook[] {
  return store.read()
}

export function writeWebhooks(webhooks: X402Webhook[]): void {
  store.write(webhooks)
}

export function registerX402Webhook(input: { serviceId: string; url: string; secret?: string }): X402Webhook {
  if (!input.serviceId?.trim()) throw new Error('serviceId is required')
  if (!input.url?.trim()) throw new Error('url is required')

  validateWebhookUrl(input.url.trim())

  const webhooks = store.read()
  const serviceId = input.serviceId.trim()
  const url = input.url.trim()
  // Use cryptographically secure random bytes — Math.random() is not suitable for secrets
  const secret = input.secret?.trim() || `whsec_${randomBytes(16).toString('hex')}`

  const existing = webhooks.find((w) => w.serviceId === serviceId && w.url === url)
  if (existing) {
    existing.secret = secret
    existing.active = true
    store.write(webhooks)
    return existing
  }

  const webhook: X402Webhook = {
    id: `wh_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
    serviceId,
    url,
    secret,
    active: true,
    createdAt: new Date().toISOString(),
  }

  store.write([webhook, ...webhooks])
  return webhook
}

export function listX402Webhooks(serviceId?: string): X402Webhook[] {
  const all = store.read()
  if (serviceId === undefined) return all
  const clean = serviceId.trim().toLowerCase()
  if (!clean) return []
  return all.filter((w) => w.serviceId.toLowerCase() === clean || w.serviceId === 'all')
}

export function deleteX402Webhook(webhookId: string): boolean {
  const all = store.read()
  const filtered = all.filter((w) => w.id !== webhookId)
  if (filtered.length !== all.length) {
    store.write(filtered)
    return true
  }
  return false
}

export function generateWebhookSignature(payload: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

export async function dispatchX402Webhooks(
  receipt: X402Receipt | X402ExplorerReceipt,
  fetcher: typeof fetch = fetch,
): Promise<X402WebhookDelivery[]> {
  const serviceId = ((receipt as X402ExplorerReceipt).serviceId || (receipt as X402ExplorerReceipt).service || '').trim()
  if (!serviceId) return []
  const targets = listX402Webhooks(serviceId).filter((w) => w.active)
  if (targets.length === 0) return []

  const payload = JSON.stringify({
    event: 'x402.settlement',
    timestamp: new Date().toISOString(),
    receipt,
  })

  const deliveries = targets.map(async (webhook): Promise<X402WebhookDelivery> => {
    const signature = generateWebhookSignature(payload, webhook.secret)
    const deliveryId = `del_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
    try {
      // URL was validated as HTTPS-only at registration; this is an intentional outbound webhook call. NOSONAR
      const res = await fetcher(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-X402-Signature': signature,
          'User-Agent': 'Open-Stellar-x402-Webhook/1.0',
        },
        body: payload,
      })
      return {
        id: deliveryId,
        webhookId: webhook.id,
        url: webhook.url,
        receiptId: receipt.paymentRef || receipt.txHash,
        status: res.status,
        success: res.ok,
        deliveredAt: new Date().toISOString(),
      }
    } catch (err) {
      return {
        id: deliveryId,
        webhookId: webhook.id,
        url: webhook.url,
        receiptId: receipt.paymentRef || receipt.txHash,
        status: 0,
        success: false,
        deliveredAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  const results = await Promise.allSettled(deliveries)
  return results
    .filter((r): r is PromiseFulfilledResult<X402WebhookDelivery> => r.status === 'fulfilled')
    .map((r) => r.value)
}

export function resetX402WebhookStoreForTests(): void {
  store.reset()
}
