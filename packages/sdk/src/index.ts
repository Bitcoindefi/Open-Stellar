export type SettlementChain = 'stellar' | 'bnb' | 'base'
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

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
  description?: string
  price?: string
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

export interface CreateQuoteInput {
  nodeUrl: string
  service: string
  price?: string
  description?: string
  chain?: SettlementChain
  payer?: string
  units?: number
  unitPriceUsd?: number
  ttlSeconds?: number
  fetch?: FetchLike
}

export interface SettlePaymentInput {
  nodeUrl: string
  paymentRef?: string
  quoteId?: string
  chain: SettlementChain
  txHash: string
  paidBy?: string
  agentId?: string
  fetch?: FetchLike
}

export interface X402Wallet {
  payX402?: (quote: X402Quote, option: X402QuoteOption) => Promise<{ txHash: string; paidBy?: string }>
  pay?: (quote: X402Quote, option: X402QuoteOption) => Promise<{ txHash: string; paidBy?: string }>
}

export interface WithX402Options {
  price: string
  service: string
  description?: string
  nodeUrl?: string
  chain?: SettlementChain
  ttlSeconds?: number
  fetch?: FetchLike
}

export type RouteHandler = (req: Request) => Response | Promise<Response>

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

function parsePriceUsd(price: string): number {
  const match = price.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (!match) throw new Error(`Unable to parse x402 price: ${price}`)
  return Number(match[1])
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as unknown
  return payload as T
}

export async function createQuote(input: CreateQuoteInput): Promise<X402Quote> {
  const fetcher = input.fetch ?? fetch
  const response = await fetcher(joinUrl(input.nodeUrl, '/api/protocol/x402/quote'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      serviceId: input.service,
      chain: input.chain ?? 'stellar',
      payer: input.payer ?? 'anonymous',
      units: input.units ?? 1,
      unitPriceUsd: input.unitPriceUsd ?? parsePriceUsd(input.price ?? '0.01'),
      ttlSeconds: input.ttlSeconds ?? 300,
    }),
  })
  const body = await readJson<{ ok?: boolean; quote?: X402Quote; error?: string }>(response)
  if (!response.ok || !body.quote) throw new Error(body.error ?? `Quote request failed with ${response.status}`)
  return { ...body.quote, description: input.description, price: input.price }
}

export async function settlePayment(input: SettlePaymentInput): Promise<X402Receipt> {
  const fetcher = input.fetch ?? fetch
  const response = await fetcher(joinUrl(input.nodeUrl, '/api/protocol/x402/settle'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readJson<{ ok?: boolean; receipt?: X402Receipt; error?: string }>(response)
  if (!response.ok || !body.receipt?.accepted) throw new Error(body.error ?? `Settlement failed with ${response.status}`)
  return body.receipt
}

export function withX402(options: WithX402Options): (handler: RouteHandler) => RouteHandler {
  return (handler: RouteHandler) => async (req: Request): Promise<Response> => {
    const nodeUrl = options.nodeUrl ?? new URL(req.url).origin
    const paymentHeader = req.headers.get('x402-payment')
    if (!paymentHeader) {
      const quote = await createQuote({
        nodeUrl,
        service: options.service,
        price: options.price,
        description: options.description,
        chain: options.chain,
        ttlSeconds: options.ttlSeconds,
        fetch: options.fetch,
      })
      return Response.json({ ok: false, quote, description: options.description }, { status: 402 })
    }

    const payment = JSON.parse(paymentHeader) as SettlePaymentInput
    await settlePayment({ ...payment, nodeUrl, fetch: options.fetch })
    return handler(req)
  }
}

export interface OpenStellarClientOptions {
  nodeUrl: string
  fetch?: FetchLike
  chain?: SettlementChain
}

export interface ClientCallOptions extends RequestInit {
  wallet: X402Wallet
  maxPrice?: string
  payer?: string
  chain?: SettlementChain
}

export class OpenStellarClient {
  private readonly nodeUrl: string
  private readonly fetcher: FetchLike
  private readonly chain: SettlementChain

  constructor(options: OpenStellarClientOptions) {
    this.nodeUrl = options.nodeUrl
    this.fetcher = options.fetch ?? fetch
    this.chain = options.chain ?? 'stellar'
  }

  async call<T = unknown>(url: string, options: ClientCallOptions): Promise<T> {
    const { wallet, maxPrice, payer, chain, ...requestInit } = options
    const first = await this.fetcher(url, requestInit)
    if (first.status !== 402) return readJson<T>(first)

    const challenge = await readJson<{ quote: X402Quote }>(first)
    const quote = challenge.quote
    const max = maxPrice ? parsePriceUsd(maxPrice) : Number.POSITIVE_INFINITY
    if (quote.amountUsd > max) throw new Error(`x402 quote ${quote.amountUsd} exceeds maxPrice ${maxPrice}`)

    const selected = quote.options.find((option) => option.chain === (chain ?? this.chain)) ?? quote.options[0]
    const pay = wallet.payX402 ?? wallet.pay
    if (!pay) throw new Error('wallet must implement payX402() or pay()')
    const payment = await pay(quote, selected)
    const receipt = await settlePayment({
      nodeUrl: this.nodeUrl,
      paymentRef: quote.paymentRef,
      quoteId: quote.quoteId,
      chain: selected.chain,
      txHash: payment.txHash,
      paidBy: payment.paidBy ?? payer,
      fetch: this.fetcher,
    })

    const headers = new Headers(requestInit.headers)
    headers.set('x402-payment', JSON.stringify({ paymentRef: receipt.paymentRef, chain: receipt.chain, txHash: receipt.txHash, paidBy: payment.paidBy ?? payer }))
    const paid = await this.fetcher(url, { ...requestInit, headers })
    if (!paid.ok) throw new Error(`Paid request failed with ${paid.status}`)
    return readJson<T>(paid)
  }
}
