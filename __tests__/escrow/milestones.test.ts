import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEscrowDeal,
  releaseMilestone,
  raiseDispute,
  cancelEscrowEarly,
  verifyEscrowInvariant,
  formatStroopsToXlm,
  resetEscrowStore,
  getEscrowById,
} from '@/lib/escrow/milestones';

describe('Escrow Milestone Payments State Machine (Issue #60)', () => {
  beforeEach(() => {
    resetEscrowStore();
  });

  // Test 1: Bloqueo al crear (Funds locked 100% upon creation)
  it('Test 1: Bloqueo al crear — locks 100% of funds upfront on creation', () => {
    const deal = createEscrowDeal({
      clientAddress: 'GCLIENT_TEST_ADDRESS_111',
      providerAddress: 'GPROVIDER_TEST_ADDRESS_222',
      totalAmount: '1.0 XLM',
      milestones: [
        { id: 1, description: 'Data fetched', releaseAmount: '0.2 XLM' },
        { id: 2, description: 'Analysis complete', releaseAmount: '0.5 XLM' },
        { id: 3, description: 'Report delivered', releaseAmount: '0.3 XLM' },
      ],
    });

    expect(deal.status).toBe('active');
    expect(deal.totalAmountStroops).toBe('10000000');
    expect(deal.remainingLockedStroops).toBe('10000000'); // 100% locked
    expect(deal.releasedAmountStroops).toBe('0');
    expect(deal.refundedAmountStroops).toBe('0');
    expect(verifyEscrowInvariant(deal)).toBe(true);
  });

  // Test 2: Liberación parcial por hito
  it('Test 2: Liberación parcial por hito — releases only its portion and never exceeds total', () => {
    const deal = createEscrowDeal({
      clientAddress: 'GCLIENT_TEST_ADDRESS_111',
      providerAddress: 'GPROVIDER_TEST_ADDRESS_222',
      totalAmount: '1.0 XLM',
      milestones: [
        { id: 1, description: 'Step 1', releaseAmount: '0.2 XLM' },
        { id: 2, description: 'Step 2', releaseAmount: '0.5 XLM' },
        { id: 3, description: 'Step 3', releaseAmount: '0.3 XLM' },
      ],
    });

    // Milestone 1 release
    const step1 = releaseMilestone(deal.id, 1, 'orchestrator');
    expect(step1.alreadyPaid).toBe(false);
    expect(step1.deal.releasedAmountStroops).toBe('2000000'); // 0.2 XLM
    expect(step1.deal.remainingLockedStroops).toBe('8000000'); // 0.8 XLM
    expect(verifyEscrowInvariant(step1.deal)).toBe(true);

    // Milestone 2 release
    const step2 = releaseMilestone(deal.id, 2, 'orchestrator');
    expect(step2.deal.releasedAmountStroops).toBe('7000000'); // 0.7 XLM
    expect(step2.deal.remainingLockedStroops).toBe('3000000'); // 0.3 XLM
    expect(verifyEscrowInvariant(step2.deal)).toBe(true);

    // Milestone 3 release -> auto-complete
    const step3 = releaseMilestone(deal.id, 3, 'orchestrator');
    expect(step3.deal.releasedAmountStroops).toBe('10000000'); // 1.0 XLM
    expect(step3.deal.remainingLockedStroops).toBe('0');
    expect(step3.deal.status).toBe('completed');
    expect(verifyEscrowInvariant(step3.deal)).toBe(true);
  });

  // Test 3: Doble aprobación paga una vez (Idempotency)
  it('Test 3: Doble aprobación paga una vez — second approval pays zero extra and is idempotent', () => {
    const deal = createEscrowDeal({
      clientAddress: 'GCLIENT_TEST_ADDRESS_111',
      providerAddress: 'GPROVIDER_TEST_ADDRESS_222',
      totalAmount: '1.0 XLM',
      milestones: [
        { id: 1, description: 'Milestone 1', releaseAmount: '0.4 XLM' },
        { id: 2, description: 'Milestone 2', releaseAmount: '0.6 XLM' },
      ],
    });

    // First release
    const firstCall = releaseMilestone(deal.id, 1, 'client');
    expect(firstCall.alreadyPaid).toBe(false);
    expect(firstCall.deal.releasedAmountStroops).toBe('4000000');
    expect(firstCall.deal.remainingLockedStroops).toBe('6000000');

    // Second release on same milestone (duplicate/retry)
    const secondCall = releaseMilestone(deal.id, 1, 'client');
    expect(secondCall.alreadyPaid).toBe(true); // Flagged as already paid
    // Balances MUST NOT change!
    expect(secondCall.deal.releasedAmountStroops).toBe('4000000');
    expect(secondCall.deal.remainingLockedStroops).toBe('6000000');
    expect(verifyEscrowInvariant(secondCall.deal)).toBe(true);
  });

  // Test 4: Disputa congela (Dispute freezes remainder, prevents further release/refund)
  it('Test 4: Disputa congela — dispute freezes remaining funds, blocking further release or refund', () => {
    const deal = createEscrowDeal({
      clientAddress: 'GCLIENT_TEST_ADDRESS_111',
      providerAddress: 'GPROVIDER_TEST_ADDRESS_222',
      totalAmount: '1.0 XLM',
      milestones: [
        { id: 1, description: 'Phase 1', releaseAmount: '0.3 XLM' },
        { id: 2, description: 'Phase 2', releaseAmount: '0.7 XLM' },
      ],
    });

    // Release Milestone 1
    releaseMilestone(deal.id, 1, 'client');

    // Raise dispute on Milestone 2 failure
    const disputedDeal = raiseDispute(deal.id, 'client', 'Provider deliverable corrupted');
    expect(disputedDeal.status).toBe('disputed');
    expect(disputedDeal.remainingLockedStroops).toBe('7000000'); // Frozen remainder
    expect(disputedDeal.releasedAmountStroops).toBe('3000000');
    expect(verifyEscrowInvariant(disputedDeal)).toBe(true);

    // Attempting to release milestone during dispute MUST throw
    expect(() => releaseMilestone(deal.id, 2, 'provider')).toThrowError(
      /Cannot release milestone: escrow is currently disputed/
    );

    // Invariant remains untampered
    expect(verifyEscrowInvariant(getEscrowById(deal.id)!)).toBe(true);
  });

  // Test 5: Cancelación temprana devuelve todo (Early cancellation refunds 100% before milestone 1)
  it('Test 5: Cancelación temprana devuelve todo — refunds 100% to client before first milestone', () => {
    const deal = createEscrowDeal({
      clientAddress: 'GCLIENT_TEST_ADDRESS_111',
      providerAddress: 'GPROVIDER_TEST_ADDRESS_222',
      totalAmount: '1.5 XLM',
      milestones: [
        { id: 1, description: 'Initial task', releaseAmount: '0.5 XLM' },
        { id: 2, description: 'Final task', releaseAmount: '1.0 XLM' },
      ],
    });

    const cancelledDeal = cancelEscrowEarly(deal.id, 'client', 'Job cancelled before kickoff');
    expect(cancelledDeal.status).toBe('cancelled');
    expect(cancelledDeal.releasedAmountStroops).toBe('0');
    expect(cancelledDeal.remainingLockedStroops).toBe('0');
    expect(cancelledDeal.refundedAmountStroops).toBe('15000000'); // 100% refunded
    expect(verifyEscrowInvariant(cancelledDeal)).toBe(true);
  });

  // Test 5b: Cannot cancel early after a milestone has already been released
  it('Test 5b: Cannot cancel early after one milestone is released', () => {
    const deal = createEscrowDeal({
      clientAddress: 'GCLIENT_TEST_ADDRESS_111',
      providerAddress: 'GPROVIDER_TEST_ADDRESS_222',
      totalAmount: '1.0 XLM',
      milestones: [
        { id: 1, description: 'Task 1', releaseAmount: '0.5 XLM' },
        { id: 2, description: 'Task 2', releaseAmount: '0.5 XLM' },
      ],
    });

    releaseMilestone(deal.id, 1, 'client');

    expect(() => cancelEscrowEarly(deal.id, 'client', 'Try cancel')).toThrowError(
      /Cannot cancel escrow: one or more milestones have already been released/
    );
  });

  // Test 6: Las porciones suman exactamente el total sin dejar residuo
  it('Test 6: Las porciones suman exactamente el total sin dejar residuo — non-divisible integer precision', () => {
    // 10 XLM split into 3 odd portions:
    // 3.3333334 XLM + 3.3333333 XLM + 3.3333333 XLM = exactly 10.0000000 XLM
    const m1Stroops = BigInt(33333334);
    const m2Stroops = BigInt(33333333);
    const m3Stroops = BigInt(33333333);
    const totalStroops = m1Stroops + m2Stroops + m3Stroops; // 100000000 = 10 XLM

    const deal = createEscrowDeal({
      clientAddress: 'GCLIENT_EXACT_SUM',
      providerAddress: 'GPROVIDER_EXACT_SUM',
      totalAmount: formatStroopsToXlm(totalStroops),
      milestones: [
        { id: 1, description: 'Portion 1', releaseAmount: formatStroopsToXlm(m1Stroops) },
        { id: 2, description: 'Portion 2', releaseAmount: formatStroopsToXlm(m2Stroops) },
        { id: 3, description: 'Portion 3', releaseAmount: formatStroopsToXlm(m3Stroops) },
      ],
    });

    expect(BigInt(deal.totalAmountStroops)).toBe(BigInt(100000000));
    expect(verifyEscrowInvariant(deal)).toBe(true);

    // Release all 3 and verify zero residue
    releaseMilestone(deal.id, 1, 'agent');
    releaseMilestone(deal.id, 2, 'agent');
    const finalDeal = releaseMilestone(deal.id, 3, 'agent').deal;

    expect(finalDeal.status).toBe('completed');
    expect(finalDeal.releasedAmountStroops).toBe('100000000');
    expect(finalDeal.remainingLockedStroops).toBe('0');
    expect(finalDeal.refundedAmountStroops).toBe('0');
    expect(verifyEscrowInvariant(finalDeal)).toBe(true);
  });

  // Test 7: Mismatched milestone sum is strictly rejected on creation
  it('Test 7: Rejects creation when milestone sum does not equal total amount', () => {
    expect(() =>
      createEscrowDeal({
        clientAddress: 'GCLIENT',
        providerAddress: 'GPROVIDER',
        totalAmount: '1.0 XLM',
        milestones: [
          { id: 1, description: 'Part 1', releaseAmount: '0.4 XLM' },
          { id: 2, description: 'Part 2', releaseAmount: '0.4 XLM' }, // Sums to 0.8 XLM != 1.0 XLM
        ],
      })
    ).toThrowError(/does not equal total amount/);
  });

  // Test 8: Full Lifecycle Balance Audit trail
  it('Test 8: Records audit history on every single state transition', () => {
    const deal = createEscrowDeal({
      clientAddress: 'GAUDIT_CLIENT',
      providerAddress: 'GAUDIT_PROVIDER',
      totalAmount: '0.5 XLM',
      milestones: [{ id: 1, description: 'Single job', releaseAmount: '0.5 XLM' }],
    });

    expect(deal.history.length).toBe(1);
    expect(deal.history[0].action).toBe('created');
    expect(deal.history[0].actor).toBe('GAUDIT_CLIENT');

    releaseMilestone(deal.id, 1, 'GAUDIT_ORCHESTRATOR');
    const updated = getEscrowById(deal.id)!;

    expect(updated.history.some((h) => h.action === 'milestone_released')).toBe(true);
    expect(updated.history.some((h) => h.action === 'auto_completed')).toBe(true);
  });
});
