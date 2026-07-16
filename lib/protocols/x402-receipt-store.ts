import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cwd } from 'node:process'
import type { SettlementChain, X402ExplorerReceipt } from '@/lib/protocols/x402'

// Import Postgres implementation
import {
  initializeX402ReceiptTable,
  saveX402Receipt as saveX402ReceiptToPostgres,
  getX402Receipt as getX402ReceiptFromPostgres,
  listX402Receipts as listX402ReceiptsFromPostgres,
  resetX402ReceiptStoreForTests as resetPostgresStore,
} from '@/lib/storage/x402-receipt-postgres'

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

const DEFAULT_DB_PATH = join(cwd(), '.data', 'x402-receipts.json')
const DB_PATH = process.env.X402_RECEIPT_DB_PATH || DEFAULT_DB_PATH

// Check if Postgres is available
const USE_POSTGRES = process.env.POSTGRES_URL !== undefined || process.env.POSTGRES_PRISMA_URL !== undefined

// Initialize Postgres table if available
if (USE_POSTGRES) {
  initializeX402ReceiptTable().catch((error) => {
    console.error('Failed to initialize Postgres x402 receipts table, falling back to file storage:', error)
  })
}

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
  renameSync(tmpPath, DB_PATH)
}

export async function saveX402Receipt(receipt: X402ExplorerReceipt): Promise<X402ExplorerReceipt> {
  if (USE_POSTGRES) {
    try {
      return await saveX402ReceiptToPostgres(receipt)
    } catch (error) {
      console.error('Failed to save to Postgres, falling back to file storage:', error)
      // Fall back to file storage
    }
  }
  
  // File-based storage (fallback)
  const receipts = readReceipts()
  const next = [receipt, ...receipts.filter((item) => item.id !== receipt.id)]
  writeReceipts(next)
  return receipt
}

export async function getX402Receipt(receiptId: string): Promise<X402ExplorerReceipt | undefined> {
  if (USE_POSTGRES) {
    try {
      return await getX402ReceiptFromPostgres(receiptId)
    } catch (error) {
      console.error('Failed to get from Postgres, falling back to file storage:', error)
      // Fall back to file storage
    }
  }
  
  // File-based storage (fallback)
  return readReceipts().find((receipt) => receipt.id === receiptId)
}

export async function listX402Receipts(filters: X402ReceiptQuery = {}): Promise<X402ReceiptPage> {
  if (USE_POSTGRES) {
    try {
      return await listX402ReceiptsFromPostgres(filters)
    } catch (error) {
      console.error('Failed to list from Postgres, falling back to file storage:', error)
      // Fall back to file storage
    }
  }
  
  // File-based storage (fallback)
  const pageSize = Math.max(1, Math.min(50, Math.floor(filters.pageSize ?? 50)))
  const page = Math.max(1, Math.floor(filters.page ?? 1))
  const q = (filters.q || '').trim().toLowerCase()
  const agent = (filters.agent || '').trim().toLowerCase()
  const service = (filters.service || '').trim().toLowerCase()
  const chain = filters.chain && filters.chain !== 'all' ? filters.chain : null
  const allReceipts = readReceipts()

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
      ].join(' ').toLowerCase()
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
      totalUsd: Number(allReceipts.reduce((sum, receipt) => sum + receipt.amountUsd, 0).toFixed(6)),
      uniqueAgents: new Set(allReceipts.map((receipt) => receipt.agentId)).size,
      services: new Set(allReceipts.map((receipt) => receipt.service)).size,
    },
  }
}

export async function resetX402ReceiptStoreForTests(): Promise<void> {
  if (USE_POSTGRES) {
    try {
      await resetPostgresStore()
      return
    } catch (error) {
      console.error('Failed to reset Postgres store, falling back to file storage:', error)
      // Fall back to file storage
    }
  }
  
  // File-based storage (fallback)
  writeReceipts([])
}
