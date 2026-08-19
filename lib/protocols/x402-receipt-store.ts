import { join } from 'node:path'
import { cwd } from 'node:process'
import type { SettlementChain, X402ExplorerReceipt } from '@/lib/protocols/x402'
import { makeJsonStore } from '@/lib/protocols/x402-store-utils'

export interface X402ReceiptQuery {
  agent?: string
  q?: string
  service?: string
  chain?: SettlementChain | 'all'
  page?: number
  pageSize?: number
}

export interface X402ReceiptPage {
  receipts: X402ExplorerReceipt[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  stats: {
    totalPayments: number
    totalUsd: number
    uniqueAgents: number
    services: number
  }
}

let dbPath = process.env.X402_RECEIPT_DB_PATH ?? join(cwd(), '.data', 'x402-receipts.json')
let store = makeJsonStore<X402ExplorerReceipt>(dbPath)

export function setX402ReceiptStorePathForTests(customPath: string): void {
  dbPath = customPath
  store = makeJsonStore<X402ExplorerReceipt>(dbPath)
}

export function resetX402ReceiptStorePathForTests(): void {
  dbPath = process.env.X402_RECEIPT_DB_PATH ?? join(cwd(), '.data', 'x402-receipts.json')
  store = makeJsonStore<X402ExplorerReceipt>(dbPath)
}

export function saveX402Receipt(receipt: X402ExplorerReceipt): X402ExplorerReceipt {
  const receipts = store.read()
  store.write([receipt, ...receipts.filter((item) => item.id !== receipt.id)])
  return receipt
}

export function getX402Receipt(receiptId: string): X402ExplorerReceipt | undefined {
  return store.read().find((receipt) => receipt.id === receiptId)
}

export function consumeX402Receipt(receiptId: string): boolean {
  const receipts = store.read()
  const target = receipts.find((receipt) => receipt.id === receiptId)
  if (!target || target.consumed) return false
  target.consumed = true
  target.consumedAt = new Date().toISOString()
  store.write(receipts)
  return true
}

export function listX402Receipts(filters: X402ReceiptQuery = {}): X402ReceiptPage {
  const pageSize = Math.max(1, Math.min(50, Math.floor(filters.pageSize ?? 50)))
  const page = Math.max(1, Math.floor(filters.page ?? 1))
  const q = (filters.q || '').trim().toLowerCase()
  const agent = (filters.agent || '').trim().toLowerCase()
  const service = (filters.service || '').trim().toLowerCase()
  const chain = filters.chain && filters.chain !== 'all' ? filters.chain : null
  const allReceipts = store.read()

  const filtered = allReceipts.filter((receipt) => {
    if (chain && receipt.chain !== chain) return false
    if (agent && receipt.agentId.toLowerCase() !== agent && receipt.agent.toLowerCase() !== agent) return false
    if (service && receipt.serviceId.toLowerCase() !== service && receipt.service.toLowerCase() !== service) return false
    if (q) {
      const haystack = [
        receipt.id,
        receipt.paymentRef,
        receipt.agentId,
        receipt.agent,
        receipt.service,
        receipt.serviceId,
        receipt.txHash,
        receipt.chain,
        receipt.amount,
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const total = filtered.length
  const start = (page - 1) * pageSize
  const receipts = filtered.slice(start, start + pageSize)

  return {
    receipts,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: {
      totalPayments: allReceipts.length,
      totalUsd: Number(allReceipts.reduce((sum, receipt) => sum + (receipt.amountUsd ?? 0), 0).toFixed(6)),
      uniqueAgents: new Set(allReceipts.map((receipt) => receipt.agentId)).size,
      services: new Set(allReceipts.map((receipt) => receipt.service)).size,
    },
  }
}

export function resetX402ReceiptStoreForTests(): void {
  store.reset()
}
