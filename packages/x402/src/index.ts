declare const process: { env?: Record<string, string | undefined> }
export interface X402GateConfig {
  endpoint?: string
  serviceId: string
  unitPriceUsd: number
  chain?: 'stellar' | 'bnb' | 'base'
  payer?: string
}

export interface X402GateRequest {
  headers: Headers
  url?: string
}

export interface X402GateResult {
  paid: boolean
  receiptId?: string
  response?: Response
}

async function verifyReceipt(endpoint: string, receiptId: string): Promise<boolean> {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/protocol/x402/receipts/${encodeURIComponent(receiptId)}`)
  if (!response.ok) return false
  const body = await response.json() as { receipt?: { accepted?: boolean } }
  return body.receipt?.accepted === true
}

export function x402Gate(config: X402GateConfig) {
  const endpoint = config.endpoint || process.env?.OPEN_STELLAR_URL || ''
  if (!endpoint) throw new Error('x402 endpoint is required')

  return async function gate(request: X402GateRequest): Promise<X402GateResult> {
    const receiptId = request.headers.get('x-x402-receipt') || request.headers.get('x-open-stellar-receipt')
    if (receiptId && await verifyReceipt(endpoint, receiptId)) return { paid: true, receiptId }

    const quote = await fetch(`${endpoint.replace(/\/$/, '')}/api/protocol/x402/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serviceId: config.serviceId,
        units: 1,
        unitPriceUsd: config.unitPriceUsd,
        chain: config.chain,
        payer: config.payer || 'anonymous',
      }),
    }).then((response) => response.json())

    return { paid: false, response: Response.json(quote, { status: 402 }) }
  }
}
