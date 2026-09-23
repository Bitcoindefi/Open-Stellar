import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cwd } from 'node:process'
import type { SettlementChain, X402ExplorerReceipt } from '@/lib/protocols/x402'
export type { X402ExplorerReceipt }

export interface X402ReceiptQuery {
  agent?: string
  q?: string
  service?: string
  chain?: SettlementChain | 'all'
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  from?: string
  to?: string
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
    totalXlm: string
    uniqueAgents: number
    services: number
  }
}

const DEFAULT_DB_PATH = join(cwd(), '.data', 'x402-receipts.json')
const DB_PATH = process.env.X402_RECEIPT_DB_PATH || DEFAULT_DB_PATH

function ensureDb(): void {
  const dir = dirname(DB_PATH)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(DB_PATH)) {
    writeFileSync(DB_PATH, '[]\n', 'utf8')
  }
}

function readReceipts(): X402ExplorerReceipt[] {
  ensureDb()
  const raw = readFileSync(DB_PATH, 'utf8').trim()
  if (!raw) return []
  const parsed = JSON.parse(raw) as X402ExplorerReceipt[]
  return Array.isArray(parsed) ? parsed : []
}

function writeReceipts(receipts: X402ExplorerReceipt[]): void {
  ensureDb()
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(receipts, null, 2)}\n`, 'utf8')
  try {
    renameSync(tmpPath, DB_PATH)
  } catch {
    // On Windows, renameSync can fail with EPERM when another process holds
    // a lock on the target file (e.g. parallel Vitest workers). Fall back to
    // a direct write so the data is not silently lost.
    writeFileSync(DB_PATH, `${JSON.stringify(receipts, null, 2)}\n`, 'utf8')
    try { renameSync(tmpPath, `${tmpPath}.done`) } catch { /* cleanup best-effort */ }
  }
}

export function saveX402Receipt(receipt: X402ExplorerReceipt): X402ExplorerReceipt {
  const receipts = readReceipts()
  const next = [receipt, ...receipts.filter((item) => item.id !== receipt.id)]
  writeReceipts(next)
  return receipt
}

export function getX402Receipt(receiptId: string): X402ExplorerReceipt | undefined {
  return readReceipts().find((receipt) => receipt.id === receiptId)
}

const XLM_REGEX = /^([\d.]+)\s*XLM/i

function extractXlmAmount(receipt: X402ExplorerReceipt): number {
  if (receipt.chain !== 'stellar') return 0
  if (receipt.amount) {
    const m = XLM_REGEX.exec(receipt.amount)
    if (m) return Number.parseFloat(m[1])
  }
  if (receipt.amountUnits && !Number.isNaN(Number(receipt.amountUnits))) {
    return Number(receipt.amountUnits) / 10_000_000
  }
  if (receipt.amountUsd) {
    return receipt.amountUsd / 0.1 // standard fallback rate
  }
  return 0
}

export function sanitizeReceiptForExplorer(receipt: X402ExplorerReceipt): X402ExplorerReceipt {
  // Public-facing contract: guarantees zero operator keys or sensitive credentials exposed
  const clean = { ...receipt }
  const sensitiveKeys = ['privateKey', 'secretKey', 'seed', 'secret', 'operatorKey', 'internalEndpoint', 'apiKey', 'authSecret']
  for (const k of sensitiveKeys) {
    delete (clean as Record<string, unknown>)[k]
  }
  return clean
}

function matchesDateRange(settledAt: string, fromTime: number | null, toTime: number | null): boolean {
  if (fromTime !== null && !Number.isNaN(fromTime)) {
    if (new Date(settledAt).getTime() < fromTime) return false
  }
  if (toTime !== null && !Number.isNaN(toTime)) {
    if (new Date(settledAt).getTime() > toTime) return false
  }
  return true
}

function matchesSearchQuery(receipt: X402ExplorerReceipt, q: string): boolean {
  if (!q) return true
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
  ].join(' ').toLowerCase()
  return haystack.includes(q)
}

export function listX402Receipts(filters: X402ReceiptQuery = {}): X402ReceiptPage {
  const pageSize = Math.max(1, Math.min(50, Math.floor(filters.pageSize ?? 50)))
  const page = Math.max(1, Math.floor(filters.page ?? 1))
  const q = (filters.q || '').trim().toLowerCase()
  const agent = (filters.agent || '').trim().toLowerCase()
  const service = (filters.service || '').trim().toLowerCase()
  const chain = filters.chain && filters.chain !== 'all' ? filters.chain : null
  const allReceipts = readReceipts()

  const fromTime = filters.startDate || filters.from ? new Date(filters.startDate || filters.from!).getTime() : null
  const toTime = filters.endDate || filters.to ? new Date(filters.endDate || filters.to!).getTime() : null

  const filtered = allReceipts.filter((receipt) => {
    if (chain && receipt.chain !== chain) return false
    if (agent && receipt.agentId.toLowerCase() !== agent && receipt.agent.toLowerCase() !== agent) return false
    if (service && receipt.serviceId.toLowerCase() !== service && receipt.service.toLowerCase() !== service) return false
    if (!matchesDateRange(receipt.settledAt, fromTime, toTime)) return false
    return matchesSearchQuery(receipt, q)
  })

  const total = filtered.length
  const start = (page - 1) * pageSize
  const receipts = filtered.slice(start, start + pageSize).map(sanitizeReceiptForExplorer)

  const totalXlmSum = allReceipts.reduce((sum, r) => sum + extractXlmAmount(r), 0)
  const totalXlmStr = totalXlmSum > 0
    ? `${totalXlmSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 7 })} XLM`
    : '0.00 XLM'

  return {
    receipts,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats: {
      totalPayments: allReceipts.length,
      totalUsd: Number(allReceipts.reduce((sum, receipt) => sum + receipt.amountUsd, 0).toFixed(6)),
      totalXlm: totalXlmStr,
      uniqueAgents: new Set(allReceipts.map((receipt) => receipt.agentId)).size,
      services: new Set(allReceipts.map((receipt) => receipt.serviceId || receipt.service)).size,
    },
  }
}

export function resetX402ReceiptStoreForTests(): void {
  writeReceipts([])
}
