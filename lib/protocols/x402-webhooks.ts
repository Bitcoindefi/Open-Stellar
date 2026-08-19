import { randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { publishSystemEvent } from '@/lib/events/system-events'
import type { X402ExplorerReceipt, X402Receipt } from '@/lib/protocols/x402'

export interface X402WebhookPayload {
  event: 'x402.settlement'
  timestamp: string
  receipt: X402Receipt | X402ExplorerReceipt
}

export interface X402WebhookDeliveryLog {
  id: string
  targetUrl: string
  status: 'delivered' | 'failed' | 'simulated'
  statusCode?: number
  error?: string
  deliveredAt: string
  payload: X402WebhookPayload
}

function parseIpToLong(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let num = 0
  for (const part of parts) {
    const n = Number(part)
    if (!Number.isInteger(n) || n < 0 || n > 255) return null
    num = num * 256 + n
  }
  return num
}

function parseDecimalOrNumericHost(host: string): string {
  let clean = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  if (clean.startsWith('::ffff:')) {
    clean = clean.replace(/^::ffff:/, '')
  }

  // Handle pure integer IPv4 representation (e.g. 2130706433 -> 127.0.0.1)
  if (/^\d+$/.test(clean)) {
    const val = Number(clean)
    if (val >= 0 && val <= 0xffffffff) {
      return `${(val >>> 24) & 255}.${(val >>> 16) & 255}.${(val >>> 8) & 255}.${val & 255}`
    }
  }

  return clean
}

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = parseDecimalOrNumericHost(hostname)

  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    return true
  }

  const ipType = isIP(host)
  if (ipType === 4) {
    const ipLong = parseIpToLong(host)
    if (ipLong !== null) {
      // 127.0.0.0/8 (Loopback range)
      if (ipLong >= 0x7f000000 && ipLong <= 0x7fffffff) return true
      // 10.0.0.0/8 (Private range)
      if (ipLong >= 0x0a000000 && ipLong <= 0x0affffff) return true
      // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
      if (ipLong >= 0xa9fe0000 && ipLong <= 0xa9feffff) return true
      // 172.16.0.0/12 (Private range)
      if (ipLong >= 0xac100000 && ipLong <= 0xac1fffff) return true
      // 192.168.0.0/16 (Private range)
      if (ipLong >= 0xc0a80000 && ipLong <= 0xc0a8ffff) return true
      // 0.0.0.0/8
      if (ipLong >= 0x00000000 && ipLong <= 0x00ffffff) return true
    }
  } else if (ipType === 6) {
    if (host === '::1' || host.startsWith('fd') || host.startsWith('fe80:')) return true
  }

  return false
}

export function validateWebhookTargetUrl(targetUrl: string): string {
  const cleanUrl = targetUrl.trim()
  if (!cleanUrl) throw new Error('targetUrl is empty')

  let parsed: URL
  try {
    parsed = new URL(cleanUrl)
  } catch {
    throw new Error('Invalid targetUrl format')
  }

  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction && parsed.protocol !== 'https:') {
    throw new Error('targetUrl must use https protocol')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('targetUrl must use http or https protocol')
  }

  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new Error('targetUrl host not allowed (private/loopback/metadata IP)')
  }

  return cleanUrl
}

const recentDeliveries: X402WebhookDeliveryLog[] = []

function extractAgentId(receipt: X402Receipt | X402ExplorerReceipt): string {
  if ('agentId' in receipt && receipt.agentId) {
    return receipt.agentId
  }
  if ('agent' in receipt && receipt.agent) {
    return receipt.agent
  }
  return 'anonymous'
}

function generateSecureDeliveryId(): string {
  return `wh_del_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

function pushDeliveryLog(log: X402WebhookDeliveryLog): void {
  recentDeliveries.unshift(log)
  if (recentDeliveries.length > 100) {
    recentDeliveries.pop()
  }
}

async function sendWebhookHttpRequest(
  targetUrl: string,
  payload: X402WebhookPayload,
  paymentRef: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'X-402-Event': 'x402.settlement',
        'X-402-Payment-Ref': paymentRef,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      return { ok: false, status: res.status || 302, error: 'Webhook redirects not allowed (SSRF protection)' }
    }

    return { ok: res.ok, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Fetch failed' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function dispatchX402SettlementWebhook(
  receipt: X402Receipt | X402ExplorerReceipt,
  targetUrl?: string,
  options: { publishToEventBus?: boolean } = {},
): Promise<X402WebhookDeliveryLog> {
  const timestamp = new Date().toISOString()
  const payload: X402WebhookPayload = { event: 'x402.settlement', timestamp, receipt }

  if (options.publishToEventBus !== false) {
    publishSystemEvent({
      type: 'payment.received',
      agentId: extractAgentId(receipt),
      receipt: receipt as X402Receipt,
    })
  }

  const deliveryId = generateSecureDeliveryId()
  const cleanUrl = targetUrl?.trim()

  if (!cleanUrl) {
    const log: X402WebhookDeliveryLog = {
      id: deliveryId,
      targetUrl: 'system://event-bus',
      status: 'delivered',
      statusCode: 200,
      deliveredAt: timestamp,
      payload,
    }
    pushDeliveryLog(log)
    return log
  }

  try {
    const validatedUrl = validateWebhookTargetUrl(cleanUrl)
    const res = await sendWebhookHttpRequest(validatedUrl, payload, receipt.paymentRef)
    const log: X402WebhookDeliveryLog = {
      id: deliveryId,
      targetUrl: validatedUrl,
      status: res.ok ? 'delivered' : 'failed',
      statusCode: res.status > 0 ? res.status : undefined,
      error: res.error,
      deliveredAt: timestamp,
      payload,
    }
    pushDeliveryLog(log)
    return log
  } catch (err) {
    const log: X402WebhookDeliveryLog = {
      id: deliveryId,
      targetUrl: cleanUrl,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Fetch failed',
      deliveredAt: timestamp,
      payload,
    }
    pushDeliveryLog(log)
    return log
  }
}

export function listX402WebhookDeliveries(): X402WebhookDeliveryLog[] {
  return [...recentDeliveries]
}

export function resetX402WebhookDeliveriesForTests(): void {
  recentDeliveries.length = 0
}
