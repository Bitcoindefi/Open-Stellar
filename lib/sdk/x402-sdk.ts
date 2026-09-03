import {
  createX402Quote,
  checkX402Subscription,
  peekX402Quote,
  settleX402,
  verifyX402Settlement,
  type SettlementChain,
  type X402Quote,
  type X402Receipt,
} from '@/lib/protocols/x402'

export interface X402RouteConfig {
  serviceId: string
  unitPriceUsd: number
  units?: number
  ttlSeconds?: number
  preferredChain?: SettlementChain
  payer?: string
  webhookUrl?: string
}

export type NextApiHandler = (req: Request) => Promise<Response> | Response

export interface X402GateResult {
  authorized: boolean
  response?: Response
  receipt?: X402Receipt
}

/**
 * Gate an incoming HTTP Request against x402 payment or active subscription.
 */
export async function gateX402Request(req: Request, config: X402RouteConfig): Promise<X402GateResult> {
  const url = new URL(req.url)
  const paymentRef =
    req.headers.get('X-402-Payment-Ref') ||
    req.headers.get('x-402-payment-ref') ||
    url.searchParams.get('paymentRef') ||
    ''

  const txHash =
    req.headers.get('X-402-Tx-Hash') ||
    req.headers.get('x-402-tx-hash') ||
    url.searchParams.get('txHash') ||
    ''

  const agentId =
    req.headers.get('X-402-Agent-Id') ||
    req.headers.get('x-402-agent-id') ||
    req.headers.get('X-Agent-ID') ||
    url.searchParams.get('agentId') ||
    ''

  const chain = (
    req.headers.get('X-402-Chain') ||
    url.searchParams.get('chain') ||
    config.preferredChain ||
    'stellar'
  ) as SettlementChain

  // 1. Check for Active Subscription
  if (agentId) {
    const sub = checkX402Subscription(agentId, config.serviceId, { consumeCall: true })
    if (sub.active) {
      return { authorized: true }
    }
  }

  // 2. Check for Payment Settlement with On-Chain Verification
  if (paymentRef && txHash) {
    const quote = peekX402Quote(paymentRef)
    if (quote) {
      const verified = await verifyX402Settlement(
        {
          quoteId: quote.quoteId,
          paymentRef,
          chain,
          txHash,
          paidBy: agentId || config.payer || 'anonymous',
        },
        quote,
      )

      if (verified.accepted) {
        const settled = settleX402({
          paymentRef,
          chain,
          txHash,
          paidBy: agentId || config.payer || 'anonymous',
        })
        if (settled.ok && settled.receipt) {
          return { authorized: true, receipt: settled.receipt }
        }
      }
    }
  }

  // 3. Otherwise return HTTP 402 Quote
  const payer = agentId || config.payer || 'anonymous'
  const quote: X402Quote = createX402Quote({
    serviceId: config.serviceId,
    unitPriceUsd: config.unitPriceUsd,
    units: config.units ?? 1,
    ttlSeconds: config.ttlSeconds ?? 300,
    chain: config.preferredChain ?? 'stellar',
    payer,
  })

  const response = new Response(JSON.stringify(quote, null, 2), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'X-402-Payment-Ref': quote.paymentRef,
      'X-402-Quote-ID': quote.quoteId,
      'X-402-Amount-USD': String(quote.amountUsd),
    },
  })

  return { authorized: false, response }
}

/**
 * 5-line integration wrapper for Next.js API route handlers.
 *
 * Example:
 * ```ts
 * import { withX402 } from '@open-stellar/x402'
 * export const GET = withX402({ serviceId: 'oracle', unitPriceUsd: 0.05 }, async (req) => {
 *   return Response.json({ data: 'hello' })
 * })
 * ```
 */
export function withX402(config: X402RouteConfig, handler: NextApiHandler): NextApiHandler {
  return async (req: Request) => {
    const gate = await gateX402Request(req, config)
    if (!gate.authorized && gate.response) {
      return gate.response
    }
    return handler(req)
  }
}
