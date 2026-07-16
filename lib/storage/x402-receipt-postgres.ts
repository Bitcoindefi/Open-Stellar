import { sql } from '@vercel/postgres'
import type { SettlementChain, X402ExplorerReceipt, X402ReceiptQuery } from '@/lib/protocols/x402'

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

/**
 * Initialize the x402_receipts table
 * This should be called during application setup
 */
export async function initializeX402ReceiptTable(): Promise<void> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS x402_receipts (
        id VARCHAR(255) PRIMARY KEY,
        quote_id VARCHAR(255),
        payment_ref VARCHAR(511) NOT NULL,
        settled_at TIMESTAMP WITH TIME ZONE NOT NULL,
        tx_hash VARCHAR(255) NOT NULL,
        chain VARCHAR(50) NOT NULL,
        amount_usd DECIMAL(10, 6),
        amount_units VARCHAR(255),
        accepted BOOLEAN NOT NULL DEFAULT true,
        agent_id VARCHAR(255),
        agent VARCHAR(255),
        service VARCHAR(255),
        service_id VARCHAR(255),
        passport_verified BOOLEAN DEFAULT true,
        reputation_tier VARCHAR(50)
      )
    `
    
    // Create indexes for performance
    await sql`CREATE INDEX IF NOT EXISTS idx_x402_receipts_agent_id ON x402_receipts(agent_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_x402_receipts_service_id ON x402_receipts(service_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_x402_receipts_chain ON x402_receipts(chain)`
    await sql`CREATE INDEX IF NOT EXISTS idx_x402_receipts_settled_at ON x402_receipts(settled_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_x402_receipts_payment_ref ON x402_receipts(payment_ref)`
    await sql`CREATE INDEX IF NOT EXISTS idx_x402_receipts_quote_id ON x402_receipts(quote_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_x402_receipts_agent_settled ON x402_receipts(agent_id, settled_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_x402_receipts_service_settled ON x402_receipts(service_id, settled_at DESC)`
  } catch (error) {
    console.error('Failed to initialize x402_receipts table:', error)
    throw error
  }
}

/**
 * Save an x402 receipt to Postgres
 */
export async function saveX402Receipt(receipt: X402ExplorerReceipt): Promise<X402ExplorerReceipt> {
  try {
    await sql`
      INSERT INTO x402_receipts (
        id, quote_id, payment_ref, settled_at, tx_hash, chain,
        amount_usd, amount_units, accepted, agent_id, agent,
        service, service_id, passport_verified, reputation_tier
      ) VALUES (
        ${receipt.id}, ${receipt.quoteId || null}, ${receipt.paymentRef}, 
        ${receipt.settledAt}, ${receipt.txHash}, ${receipt.chain},
        ${receipt.amountUsd || null}, ${receipt.amountUnits || null}, 
        ${receipt.accepted}, ${receipt.agentId || null}, ${receipt.agent || null},
        ${receipt.service || null}, ${receipt.serviceId || null}, 
        ${receipt.passportVerified}, ${receipt.reputationTier || null}
      )
      ON CONFLICT (id) DO UPDATE SET
        quote_id = EXCLUDED.quote_id,
        payment_ref = EXCLUDED.payment_ref,
        settled_at = EXCLUDED.settled_at,
        tx_hash = EXCLUDED.tx_hash,
        chain = EXCLUDED.chain,
        amount_usd = EXCLUDED.amount_usd,
        amount_units = EXCLUDED.amount_units,
        accepted = EXCLUDED.accepted,
        agent_id = EXCLUDED.agent_id,
        agent = EXCLUDED.agent,
        service = EXCLUDED.service,
        service_id = EXCLUDED.service_id,
        passport_verified = EXCLUDED.passport_verified,
        reputation_tier = EXCLUDED.reputation_tier
    `
    return receipt
  } catch (error) {
    console.error('Failed to save x402 receipt:', error)
    throw error
  }
}

/**
 * Get a single x402 receipt by ID
 */
export async function getX402Receipt(receiptId: string): Promise<X402ExplorerReceipt | undefined> {
  try {
    const result = await sql`
      SELECT 
        id, 
        quote_id as "quoteId",
        payment_ref as "paymentRef",
        settled_at as "settledAt",
        tx_hash as "txHash",
        chain,
        amount_usd as "amountUsd",
        amount_units as "amountUnits",
        accepted,
        agent_id as "agentId",
        agent,
        service,
        service_id as "serviceId",
        passport_verified as "passportVerified",
        reputation_tier as "reputationTier"
      FROM x402_receipts
      WHERE id = ${receiptId}
    `
    
    if (result.rows.length === 0) {
      return undefined
    }
    
    return result.rows[0] as X402ExplorerReceipt
  } catch (error) {
    console.error('Failed to get x402 receipt:', error)
    throw error
  }
}

/**
 * List x402 receipts with filtering and pagination
 */
export async function listX402Receipts(filters: X402ReceiptQuery = {}): Promise<X402ReceiptPage> {
  try {
    const pageSize = Math.max(1, Math.min(50, Math.floor(filters.pageSize ?? 50)))
    const page = Math.max(1, Math.floor(filters.page ?? 1))
    const q = (filters.q || '').trim().toLowerCase()
    const agent = (filters.agent || '').trim().toLowerCase()
    const service = (filters.service || '').trim().toLowerCase()
    const chain = filters.chain && filters.chain !== 'all' ? filters.chain : null
    
    // Build WHERE clause
    const conditions: string[] = []
    const params: (string | number | boolean)[] = []
    let paramIndex = 1
    
    if (chain) {
      conditions.push(`chain = $${paramIndex}`)
      params.push(chain)
      paramIndex++
    }
    
    if (agent) {
      conditions.push(`(LOWER(agent_id) = $${paramIndex} OR LOWER(agent) = $${paramIndex})`)
      params.push(agent)
      paramIndex++
    }
    
    if (service) {
      conditions.push(`(LOWER(service_id) = $${paramIndex} OR LOWER(service) = $${paramIndex})`)
      params.push(service)
      paramIndex++
    }
    
    if (q) {
      conditions.push(`(
        LOWER(id) LIKE $${paramIndex} OR
        LOWER(payment_ref) LIKE $${paramIndex} OR
        LOWER(agent_id) LIKE $${paramIndex} OR
        LOWER(agent) LIKE $${paramIndex} OR
        LOWER(service) LIKE $${paramIndex} OR
        LOWER(service_id) LIKE $${paramIndex} OR
        LOWER(tx_hash) LIKE $${paramIndex} OR
        LOWER(chain) LIKE $${paramIndex} OR
        LOWER(amount) LIKE $${paramIndex}
      )`)
      params.push(`%${q}%`)
      paramIndex++
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM x402_receipts
      ${sql.unsafe(whereClause, ...params)}
    `
    const total = parseInt(countResult.rows[0].total as string, 10)
    
    // Get paginated results
    const offset = (page - 1) * pageSize
    const receiptsResult = await sql`
      SELECT 
        id, 
        quote_id as "quoteId",
        payment_ref as "paymentRef",
        settled_at as "settledAt",
        tx_hash as "txHash",
        chain,
        amount_usd as "amountUsd",
        amount_units as "amountUnits",
        accepted,
        agent_id as "agentId",
        agent,
        service,
        service_id as "serviceId",
        passport_verified as "passportVerified",
        reputation_tier as "reputationTier"
      FROM x402_receipts
      ${sql.unsafe(whereClause, ...params)}
      ORDER BY settled_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `
    
    const receipts = receiptsResult.rows as X402ExplorerReceipt[]
    
    // Get overall stats (not filtered)
    const statsResult = await sql`
      SELECT 
        COUNT(*) as total_payments,
        COALESCE(SUM(amount_usd), 0) as total_usd,
        COUNT(DISTINCT agent_id) as unique_agents,
        COUNT(DISTINCT service) as services
      FROM x402_receipts
    `
    
    const stats = {
      totalPayments: parseInt(statsResult.rows[0].total_payments as string, 10),
      totalUsd: parseFloat(statsResult.rows[0].total_usd as string),
      uniqueAgents: parseInt(statsResult.rows[0].unique_agents as string, 10),
      services: parseInt(statsResult.rows[0].services as string, 10),
    }
    
    return {
      receipts,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      stats,
    }
  } catch (error) {
    console.error('Failed to list x402 receipts:', error)
    throw error
  }
}

/**
 * Reset the x402 receipts table (for testing only)
 */
export async function resetX402ReceiptStoreForTests(): Promise<void> {
  try {
    await sql`DELETE FROM x402_receipts`
  } catch (error) {
    console.error('Failed to reset x402 receipt store:', error)
    throw error
  }
}
