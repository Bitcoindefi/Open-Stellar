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

const recentDeliveries: X402WebhookDeliveryLog[] = []

export async function dispatchX402SettlementWebhook(
  receipt: X402Receipt | X402ExplorerReceipt,
  targetUrl?: string,
): Promise<X402WebhookDeliveryLog> {
  const timestamp = new Date().toISOString()
  const payload: X402WebhookPayload = {
    event: 'x402.settlement',
    timestamp,
    receipt,
  }

  // Publish to system event bus so global webhooks pick it up
  publishSystemEvent({
    type: 'payment.received',
    agentId: ('agentId' in receipt && receipt.agentId) ? receipt.agentId : ('agent' in receipt && receipt.agent) ? receipt.agent : 'anonymous',
    receipt: receipt as X402Receipt,
  })

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
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(cleanUrl, {
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
      targetUrl: cleanUrl,
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
