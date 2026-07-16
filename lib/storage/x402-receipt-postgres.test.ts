import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { sql } from '@vercel/postgres'
import type { X402ExplorerReceipt } from '@/lib/protocols/x402'
import {
  initializeX402ReceiptTable,
  saveX402Receipt,
  getX402Receipt,
  listX402Receipts,
  resetX402ReceiptStoreForTests,
} from './x402-receipt-postgres'

// Mock the sql module
vi.mock('@vercel/postgres', () => ({
  sql: vi.fn(),
}))

describe('x402 receipt postgres storage', () => {
  const mockReceipt: X402ExplorerReceipt = {
    id: 'test-receipt-1',
    quoteId: 'q_test',
    paymentRef: 'service:stellar:1234567890',
    settledAt: '2024-01-15T10:30:00.000Z',
    txHash: '0x' + 'a'.repeat(64),
    chain: 'stellar',
    amountUsd: 0.5,
    amountUnits: '5000000',
    accepted: true,
    agentId: 'agent-123',
    agent: 'agent-123',
    service: 'test-service',
    serviceId: 'test-service',
    passportVerified: true,
    reputationTier: 'gold',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initializeX402ReceiptTable', () => {
    it('creates table and indexes successfully', async () => {
      vi.mocked(sql).mockResolvedValue({ rows: [] } as any)

      await expect(initializeX402ReceiptTable()).resolves.not.toThrow()

      expect(sql).toHaveBeenCalledTimes(9) // 1 CREATE TABLE + 8 CREATE INDEX
    })

    it('handles initialization errors gracefully', async () => {
      vi.mocked(sql).mockRejectedValue(new Error('Connection failed'))

      await expect(initializeX402ReceiptTable()).rejects.toThrow('Connection failed')
    })
  })

  describe('saveX402Receipt', () => {
    it('saves a new receipt successfully', async () => {
      vi.mocked(sql).mockResolvedValue({ rows: [] } as any)

      await expect(saveX402Receipt(mockReceipt)).resolves.toEqual(mockReceipt)

      expect(sql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO x402_receipts')
      )
    })

    it('updates existing receipt on conflict', async () => {
      vi.mocked(sql).mockResolvedValue({ rows: [] } as any)

      await expect(saveX402Receipt(mockReceipt)).resolves.toEqual(mockReceipt)

      expect(sql).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (id) DO UPDATE')
      )
    })

    it('handles save errors gracefully', async () => {
      vi.mocked(sql).mockRejectedValue(new Error('Save failed'))

      await expect(saveX402Receipt(mockReceipt)).rejects.toThrow('Save failed')
    })
  })

  describe('getX402Receipt', () => {
    it('retrieves a receipt by ID', async () => {
      vi.mocked(sql).mockResolvedValue({
        rows: [mockReceipt],
      } as any)

      const result = await getX402Receipt('test-receipt-1')

      expect(result).toEqual(mockReceipt)
      expect(sql).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      )
    })

    it('returns undefined for non-existent receipt', async () => {
      vi.mocked(sql).mockResolvedValue({
        rows: [],
      } as any)

      const result = await getX402Receipt('non-existent')

      expect(result).toBeUndefined()
    })

    it('handles query errors gracefully', async () => {
      vi.mocked(sql).mockRejectedValue(new Error('Query failed'))

      await expect(getX402Receipt('test-receipt-1')).rejects.toThrow('Query failed')
    })
  })

  describe('listX402Receipts', () => {
    it('lists receipts with default pagination', async () => {
      vi.mocked(sql)
        .mockResolvedValueOnce({ rows: [{ total: 10 }] } as any) // count
        .mockResolvedValueOnce({ rows: [mockReceipt] } as any) // receipts
        .mockResolvedValueOnce({
          rows: [
            { total_payments: 10, total_usd: 5.5, unique_agents: 5, services: 3 },
          ],
        } as any) // stats

      const result = await listX402Receipts()

      expect(result.receipts).toHaveLength(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(50)
      expect(result.total).toBe(10)
      expect(result.totalPages).toBe(1)
      expect(result.stats.totalPayments).toBe(10)
      expect(result.stats.totalUsd).toBe(5.5)
    })

    it('filters by agent ID', async () => {
      vi.mocked(sql)
        .mockResolvedValueOnce({ rows: [{ total: 5 }] } as any)
        .mockResolvedValueOnce({ rows: [mockReceipt] } as any)
        .mockResolvedValueOnce({
          rows: [
            { total_payments: 10, total_usd: 5.5, unique_agents: 5, services: 3 },
          ],
        } as any)

      await listX402Receipts({ agent: 'agent-123' })

      expect(sql).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(agent_id)')
      )
    })

    it('filters by service ID', async () => {
      vi.mocked(sql)
        .mockResolvedValueOnce({ rows: [{ total: 3 }] } as any)
        .mockResolvedValueOnce({ rows: [mockReceipt] } as any)
        .mockResolvedValueOnce({
          rows: [
            { total_payments: 10, total_usd: 5.5, unique_agents: 5, services: 3 },
          ],
        } as any)

      await listX402Receipts({ service: 'test-service' })

      expect(sql).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(service_id)')
      )
    })

    it('filters by chain', async () => {
      vi.mocked(sql)
        .mockResolvedValueOnce({ rows: [{ total: 7 }] } as any)
        .mockResolvedValueOnce({ rows: [mockReceipt] } as any)
        .mockResolvedValueOnce({
          rows: [
            { total_payments: 10, total_usd: 5.5, unique_agents: 5, services: 3 },
          ],
        } as any)

      await listX402Receipts({ chain: 'stellar' })

      expect(sql).toHaveBeenCalledWith(expect.stringContaining('chain ='))
    })

    it('searches with query string', async () => {
      vi.mocked(sql)
        .mockResolvedValueOnce({ rows: [{ total: 2 }] } as any)
        .mockResolvedValueOnce({ rows: [mockReceipt] } as any)
        .mockResolvedValueOnce({
          rows: [
            { total_payments: 10, total_usd: 5.5, unique_agents: 5, services: 3 },
          ],
        } as any)

      await listX402Receipts({ q: 'test' })

      expect(sql).toHaveBeenCalledWith(
        expect.stringContaining('LIKE')
      )
    })

    it('handles pagination correctly', async () => {
      vi.mocked(sql)
        .mockResolvedValueOnce({ rows: [{ total: 100 }] } as any)
        .mockResolvedValueOnce({ rows: [mockReceipt] } as any)
        .mockResolvedValueOnce({
          rows: [
            { total_payments: 10, total_usd: 5.5, unique_agents: 5, services: 3 },
          ],
        } as any)

      const result = await listX402Receipts({ page: 2, pageSize: 25 })

      expect(result.page).toBe(2)
      expect(result.pageSize).toBe(25)
      expect(result.totalPages).toBe(4)
    })

    it('limits page size to maximum of 50', async () => {
      vi.mocked(sql)
        .mockResolvedValueOnce({ rows: [{ total: 100 }] } as any)
        .mockResolvedValueOnce({ rows: [mockReceipt] } as any)
        .mockResolvedValueOnce({
          rows: [
            { total_payments: 10, total_usd: 5.5, unique_agents: 5, services: 3 },
          ],
        } as any)

      await listX402Receipts({ pageSize: 100 })

      expect(sql).toHaveBeenCalledWith(expect.stringContaining('LIMIT 50'))
    })

    it('handles list errors gracefully', async () => {
      vi.mocked(sql).mockRejectedValue(new Error('List failed'))

      await expect(listX402Receipts()).rejects.toThrow('List failed')
    })
  })

  describe('resetX402ReceiptStoreForTests', () => {
    it('clears all receipts', async () => {
      vi.mocked(sql).mockResolvedValue({ rows: [] } as any)

      await expect(resetX402ReceiptStoreForTests()).resolves.not.toThrow()

      expect(sql).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM x402_receipts'))
    })

    it('handles reset errors gracefully', async () => {
      vi.mocked(sql).mockRejectedValue(new Error('Reset failed'))

      await expect(resetX402ReceiptStoreForTests()).rejects.toThrow('Reset failed')
    })
  })
})
