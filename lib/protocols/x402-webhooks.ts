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

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    return true
  }

  // Check 169.254.x.x (AWS/GCP/Azure Metadata service)
  if (host.startsWith('169.254.')) return true
  // Check 10.x.x.x
  if (host.startsWith('10.')) return true
  // Check 192.168.x.x
  if (host.startsWith('192.168.')) return true
  // Check 172.16.x.x - 172.31.x.x
  const match172 = host.match(/^172\.(\d+)\./)
  if (match172) {
    const octet = Number(match172[1])
    if (octet >= 16 && octet <= 31) return true
  }

  // IPv6 ULA / link-local
  if (host.startsWith('fd') || host.startsWith('fe80:')) return true

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

export async function dispatchX402SettlementWebhook(
  receipt: X402Receipt | X402ExplorerReceipt,
  targetUrl?: string,
  options: { publishToEventBus?: boolean } = {},
): Promise<X402WebhookDeliveryLog> {
  const timestamp = new Date().toISOString()
  const payload: X402WebhookPayload = {
    event: 'x402.settlement',
    timestamp,
    receipt,
  }

  // Only publish verified system settlements to the system event bus
  if (options.publishToEventBus !== false) {
    publishSystemEvent({
      type: 'payment.received',
      agentId:
        'agentId' in receipt && receipt.agentId
          ? receipt.agentId
          : 'agent' in receipt && receipt.agent
            ? receipt.agent
            : 'anonymous',
      receipt: receipt as X402Receipt,
    })
  }

  const deliveryId = `wh_del_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
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
    recentDeliveries.unshift(log)
    if (recentDeliveries.length > 100) recentDeliveries.pop()
    return log
  }

  try {
    const validatedUrl = validateWebhookTargetUrl(cleanUrl)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(validatedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-402-Event': 'x402.settlement',
        'X-402-Payment-Ref': receipt.paymentRef,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const log: X402WebhookDeliveryLog = {
      id: deliveryId,
      targetUrl: validatedUrl,
      status: res.ok ? 'delivered' : 'failed',
      statusCode: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`,
      deliveredAt: timestamp,
      payload,
    }
    recentDeliveries.unshift(log)
    if (recentDeliveries.length > 100) recentDeliveries.pop()
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
    recentDeliveries.unshift(log)
    if (recentDeliveries.length > 100) recentDeliveries.pop()
    return log
  }
}

export function listX402WebhookDeliveries(): X402WebhookDeliveryLog[] {
  return [...recentDeliveries]
}

export function resetX402WebhookDeliveriesForTests(): void {
  recentDeliveries.length = 0
}
