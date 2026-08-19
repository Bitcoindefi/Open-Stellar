import { checkX402Subscription, createX402Quote, type SettlementChain, type X402Quote } from '@/lib/protocols/x402'
import { getX402Receipt } from '@/lib/protocols/x402-receipt-store'

export interface X402GateConfig {
  serviceId: string
  unitPriceUsd: number
  units?: number
  chain?: SettlementChain
  reputationGate?: {
    minReputation: number
    tier?: string
  }
}

export type X402NextHandler = (
  req: Request,
  context?: unknown
) => Promise<Response> | Response

export function withX402(config: X402GateConfig, handler: X402NextHandler): X402NextHandler {
  return async (req: Request, context?: unknown) => {
    const receiptId = req.headers.get('x-x402-receipt-id') || req.headers.get('x-receipt-id')
    const subscriptionId = req.headers.get('x-x402-subscription-id') || req.headers.get('x-subscription-id')
    const agentId = req.headers.get('x-x402-agent-id') || req.headers.get('x-agent-id') || 'anonymous'

    if (subscriptionId || (agentId && agentId !== 'anonymous')) {
      const subCheck = checkX402Subscription(agentId, config.serviceId, { consumeCall: true })
      if (subCheck.active) {
        const response = await handler(req, context)
        const res = response instanceof Response ? response : Response.json(response)
        res.headers.set('X-X402-Status', 'subscription_active')
        if (subCheck.callsRemaining !== null) {
          res.headers.set('X-X402-Calls-Remaining', String(subCheck.callsRemaining))
        }
        return res
      }
    }

    if (receiptId) {
      const receipt = getX402Receipt(receiptId)
      if (receipt && receipt.accepted && (receipt.serviceId === config.serviceId || receipt.service === config.serviceId)) {
        const response = await handler(req, context)
        const res = response instanceof Response ? response : Response.json(response)
        res.headers.set('X-X402-Receipt-Id', receipt.id)
        res.headers.set('X-X402-Status', 'receipt_verified')
        return res
      }
    }

    const quote: X402Quote = createX402Quote({
      serviceId: config.serviceId,
      unitPriceUsd: config.unitPriceUsd,
      units: config.units ?? 1,
      chain: config.chain ?? 'stellar',
      payer: agentId,
      reputationGate: config.reputationGate,
    })

    return Response.json(
      {
        error: 'Payment Required',
        message: 'This API route requires payment via x402 protocol.',
        quote,
      },
      {
        status: 402,
        headers: {
          'X-X402-Quote-Id': quote.quoteId,
          'X-X402-Payment-Ref': quote.paymentRef,
          'X-X402-Amount-Usd': String(quote.amountUsd),
          'WWW-Authenticate': `X402 serviceId="${quote.serviceId}", quoteId="${quote.quoteId}"`,
        },
      }
    )
  }
}

export { createX402Quote, getX402Receipt, checkX402Subscription }
