import { describe, it, expect, beforeEach } from 'vitest';
import { POST as createEscrowRoute, GET as listEscrowRoute } from '@/app/api/escrow/route';
import { GET as getEscrowByIdRoute } from '@/app/api/escrow/[id]/route';
import { POST as releaseMilestoneRoute } from '@/app/api/escrow/[id]/release-milestone/route';
import { POST as disputeEscrowRoute } from '@/app/api/escrow/[id]/dispute/route';
import { POST as cancelEscrowRoute } from '@/app/api/escrow/[id]/cancel/route';
import { resetEscrowStore } from '@/lib/escrow/milestones';

function createMockEscrowRequest(options: {
  id?: string;
  client?: string;
  provider?: string;
  total?: string;
  milestones?: Array<{ id?: number; description: string; releaseAmount: string }>;
}) {
  return new Request('http://localhost/api/escrow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: options.id,
      clientAddress: options.client ?? 'GCLIENT_DEFAULT',
      providerAddress: options.provider ?? 'GPROVIDER_DEFAULT',
      totalAmount: options.total ?? '1.0 XLM',
      milestones: options.milestones ?? [
        { id: 1, description: 'Phase 1', releaseAmount: '0.5 XLM' },
        { id: 2, description: 'Phase 2', releaseAmount: '0.5 XLM' },
      ],
    }),
  });
}

describe('Escrow API Routes (Issue #60)', () => {
  beforeEach(() => {
    resetEscrowStore();
  });

  it('creates an escrow via POST /api/escrow and lists it via GET /api/escrow', async () => {
    const postReq = createMockEscrowRequest({
      client: 'GCLIENT_API_TEST',
      provider: 'GPROVIDER_API_TEST',
      total: '1.0 XLM',
      milestones: [
        { id: 1, description: 'Milestone 1', releaseAmount: '0.5 XLM' },
        { id: 2, description: 'Milestone 2', releaseAmount: '0.5 XLM' },
      ],
    });

    const createRes = await createEscrowRoute(postReq);
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.ok).toBe(true);
    expect(createData.escrow.id).toBeDefined();
    expect(createData.escrow.status).toBe('active');

    // List escrows
    const listReq = new Request('http://localhost/api/escrow?status=active');
    const listRes = await listEscrowRoute(listReq);
    const listData = await listRes.json();
    expect(listData.ok).toBe(true);
    expect(listData.count).toBe(1);
  });

  it('fetches escrow by ID via GET /api/escrow/[id]', async () => {
    const postReq = createMockEscrowRequest({
      id: 'esc_custom_test_123',
      total: '0.2 XLM',
      milestones: [{ id: 1, description: 'Single', releaseAmount: '0.2 XLM' }],
    });

    await createEscrowRoute(postReq);

    const getReq = new Request('http://localhost/api/escrow/esc_custom_test_123');
    const getRes = await getEscrowByIdRoute(getReq, {
      params: Promise.resolve({ id: 'esc_custom_test_123' }),
    });
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.ok).toBe(true);
    expect(getData.escrow.id).toBe('esc_custom_test_123');
  });

  it('releases milestone via POST /api/escrow/[id]/release-milestone with idempotency', async () => {
    const postReq = createMockEscrowRequest({ id: 'esc_release_test' });
    await createEscrowRoute(postReq);

    // Release Milestone 1
    const relReq1 = new Request('http://localhost/api/escrow/esc_release_test/release-milestone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId: 1, actor: 'client' }),
    });

    const relRes1 = await releaseMilestoneRoute(relReq1, {
      params: Promise.resolve({ id: 'esc_release_test' }),
    });
    expect(relRes1.status).toBe(200);
    const relData1 = await relRes1.json();
    expect(relData1.alreadyPaid).toBe(false);
    expect(relData1.escrow.releasedAmountStroops).toBe('5000000');

    // Duplicate release (idempotency check)
    const relReq2 = new Request('http://localhost/api/escrow/esc_release_test/release-milestone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId: 1, actor: 'client' }),
    });

    const relRes2 = await releaseMilestoneRoute(relReq2, {
      params: Promise.resolve({ id: 'esc_release_test' }),
    });
    expect(relRes2.status).toBe(200);
    const relData2 = await relRes2.json();
    expect(relData2.alreadyPaid).toBe(true);
    expect(relData2.escrow.releasedAmountStroops).toBe('5000000'); // Unchanged
  });

  it('raises dispute via POST /api/escrow/[id]/dispute and freezes funds', async () => {
    const postReq = createMockEscrowRequest({ id: 'esc_dispute_test' });
    await createEscrowRoute(postReq);

    const disputeReq = new Request('http://localhost/api/escrow/esc_dispute_test/dispute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'client', reason: 'Subtask output failed quality check' }),
    });

    const disputeRes = await disputeEscrowRoute(disputeReq, {
      params: Promise.resolve({ id: 'esc_dispute_test' }),
    });
    expect(disputeRes.status).toBe(200);
    const disputeData = await disputeRes.json();
    expect(disputeData.ok).toBe(true);
    expect(disputeData.escrow.status).toBe('disputed');
  });

  it('cancels early via POST /api/escrow/[id]/cancel before first milestone', async () => {
    const postReq = createMockEscrowRequest({
      id: 'esc_cancel_test',
      total: '1.0 XLM',
      milestones: [{ id: 1, description: 'Work', releaseAmount: '1.0 XLM' }],
    });
    await createEscrowRoute(postReq);

    const cancelReq = new Request('http://localhost/api/escrow/esc_cancel_test/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'client', reason: 'Project scope cancelled' }),
    });

    const cancelRes = await cancelEscrowRoute(cancelReq, {
      params: Promise.resolve({ id: 'esc_cancel_test' }),
    });
    expect(cancelRes.status).toBe(200);
    const cancelData = await cancelRes.json();
    expect(cancelData.ok).toBe(true);
    expect(cancelData.escrow.status).toBe('cancelled');
    expect(cancelData.escrow.refundedAmountStroops).toBe('10000000');
  });
});
