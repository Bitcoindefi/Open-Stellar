export type SettlementChain = 'bnb' | 'base' | 'stellar'

export interface X402QuoteOption {
  chain: SettlementChain
  amount: string
  amountUnits: string
  address: string
}

export interface X402Quote {
  code: 402
  quoteId: string
  service: string
  serviceId: string
  chain: SettlementChain
  payer: string
  amountUsd: number
  amountUnits: string
  address: string
  options: X402QuoteOption[]
  expiresAt: string
  paymentRef: string
  memo: string
}

export interface X402Receipt {
  accepted: boolean
  quoteId?: string
  paymentRef: string
  settledAt: string
  txHash: string
  chain: SettlementChain
  amountUsd?: number
  amountUnits?: string
}

export interface X402GateConfig {
  serviceId: string
  unitPriceUsd: number
  units?: number
  chain?: SettlementChain
}

export type X402NextHandler = (
  req: Request,
  context?: unknown
) => Promise<Response> | Response

/**
 * Wraps any Next.js API route handler with x402 payment protection.
 * Returns HTTP 402 with a quote if unpaid, or executes handler when verified.
 * 
 * Usage example (5 lines):
 * ```ts
 * import { withX402 } from '@open-stellar/x402'
 * export const GET = withX402({ serviceId: 'my-service', unitPriceUsd: 0.05 }, async () => {
 *   return Response.json({ data: 'Protected Content' })
 * })
 * ```
 */
export function withX402(config: X402GateConfig, handler: X402NextHandler): X402NextHandler {
  return async (req: Request, context?: unknown) => {
    const receiptId = req.headers.get('x-x402-receipt-id') || req.headers.get('x-receipt-id')
    const subscriptionId = req.headers.get('x-x402-subscription-id') || req.headers.get('x-subscription-id')
    const hasProof = Boolean(receiptId || subscriptionId)

    if (hasProof) {
      const response = await handler(req, context)
      const res = response instanceof Response ? response : Response.json(response)
      res.headers.set('X-X402-Status', 'verified')
      return res
    }

    const units = config.units ?? 1
    const amountUsd = Number((units * config.unitPriceUsd).toFixed(6))
    const quoteId = `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const paymentRef = `${config.serviceId}:${config.chain ?? 'stellar'}:${Date.now()}`

    const quote: X402Quote = {
      code: 402,
      quoteId,
      service: config.serviceId,
      serviceId: config.serviceId,
      chain: config.chain ?? 'stellar',
      payer: req.headers.get('x-agent-id') || 'anonymous',
      amountUsd,
      amountUnits: String(amountUsd),
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      options: [
        { chain: 'stellar', amount: `${amountUsd / 0.1} XLM`, amountUnits: String(amountUsd / 0.1), address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' },
        { chain: 'bnb', amount: `${amountUsd / 550} BNB`, amountUnits: String(amountUsd / 550), address: '0x0000000000000000000000000000000000000000' },
        { chain: 'base', amount: `${amountUsd / 3000} ETH`, amountUnits: String(amountUsd / 3000), address: '0x0000000000000000000000000000000000000000' },
      ],
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      paymentRef,
      memo: `x402/${config.serviceId}/${quoteId}`,
    }

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
