/**
 * State Machine and Storage for Multi-Milestone Escrow Deals
 * References Issue #60: Escrow milestone payments — trustless payment release for multi-step agent work
 * 
 * Invariant Rule:
 * releasedAmountStroops + remainingLockedStroops + refundedAmountStroops === totalAmountStroops
 */

export interface MilestoneInput {
  id?: number;
  description: string;
  releaseAmount: string; // e.g. "0.2 XLM" or raw number string
}

export interface Milestone {
  id: number;
  description: string;
  releaseAmount: string;
  releaseAmountStroops: string;
  status: 'pending' | 'completed' | 'disputed';
  completedAt?: string;
  completedBy?: string;
  txHash?: string;
}

export type EscrowStatus = 'active' | 'completed' | 'disputed' | 'cancelled';

export interface EscrowEvent {
  action: 'created' | 'milestone_released' | 'disputed' | 'cancelled' | 'auto_completed';
  actor: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface EscrowMilestoneDeal {
  id: string; // e.g. "esc_abc123"
  dealIdNumeric: number;
  clientAddress: string;
  providerAddress: string;
  totalAmount: string;
  totalAmountStroops: string;
  releasedAmountStroops: string;
  refundedAmountStroops: string;
  remainingLockedStroops: string;
  status: EscrowStatus;
  milestones: Milestone[];
  currentMilestoneIndex: number;
  createdAt: string;
  updatedAt: string;
  disputeReason?: string;
  disputedAt?: string;
  disputedBy?: string;
  cancelledAt?: string;
  history: EscrowEvent[];
  sorobanContractId?: string;
}

export interface CreateEscrowParams {
  clientAddress: string;
  providerAddress: string;
  totalAmount?: string;
  milestones: MilestoneInput[];
  sorobanContractId?: string;
  customId?: string;
}

const ZERO_BI = BigInt(0);
const STROOP_FACTOR = BigInt(10000000); // 1 XLM = 10^7 stroops

/**
 * Parses user-provided amount string ("1.0 XLM", "0.25", 5000000) to precise BigInt stroops.
 */
export function parseAmountToStroops(amount: string | number): bigint {
  if (typeof amount === 'number') {
    return BigInt(Math.round(amount * 10000000));
  }
  const cleaned = amount.trim().replace(/\s*XLM$/i, '').replace(/,/g, '');
  if (!cleaned || isNaN(Number(cleaned))) {
    throw new Error(`Invalid amount format: "${amount}"`);
  }

  const parts = cleaned.split('.');
  const whole = BigInt(parts[0] || '0') * STROOP_FACTOR;
  if (parts.length === 1) {
    return whole;
  }

  let fracStr = parts[1].slice(0, 7);
  while (fracStr.length < 7) {
    fracStr += '0';
  }
  const frac = BigInt(fracStr);
  return whole + frac;
}

/**
 * Formats stroops to user-friendly XLM string representation.
 */
export function formatStroopsToXlm(stroops: bigint): string {
  const isNegative = stroops < ZERO_BI;
  const absVal = isNegative ? -stroops : stroops;
  const whole = absVal / STROOP_FACTOR;
  const frac = absVal % STROOP_FACTOR;
  if (frac === ZERO_BI) {
    return `${isNegative ? '-' : ''}${whole}.0 XLM`;
  }
  const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '');
  return `${isNegative ? '-' : ''}${whole}.${fracStr} XLM`;
}

/**
 * Strictly verifies the core accounting invariant:
 * released + remainingLocked + refunded === totalAmount
 */
export function verifyEscrowInvariant(deal: EscrowMilestoneDeal): boolean {
  const released = BigInt(deal.releasedAmountStroops);
  const locked = BigInt(deal.remainingLockedStroops);
  const refunded = BigInt(deal.refundedAmountStroops);
  const total = BigInt(deal.totalAmountStroops);

  const sumMatches = (released + locked + refunded) === total;
  
  // Also verify milestone sum
  const milestoneSum = deal.milestones.reduce(
    (acc, m) => acc + BigInt(m.releaseAmountStroops),
    ZERO_BI
  );
  const milestonesMatchTotal = milestoneSum === total;

  return sumMatches && milestonesMatchTotal;
}

// In-Memory Global Store for Deals (with deterministic persistence across requests)
const globalEscrowStore = new Map<string, EscrowMilestoneDeal>();
let nextDealNumericCounter = 1000;

export function resetEscrowStore(): void {
  globalEscrowStore.clear();
  nextDealNumericCounter = 1000;
}

export function getAllEscrows(): EscrowMilestoneDeal[] {
  return Array.from(globalEscrowStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getEscrowById(id: string): EscrowMilestoneDeal | undefined {
  return globalEscrowStore.get(id);
}

/**
 * Creates and locks a new multi-milestone escrow deal.
 * Enforces upfront fund lock and exact milestone portion summation.
 */
export function createEscrowDeal(params: CreateEscrowParams): EscrowMilestoneDeal {
  if (!params.clientAddress || !params.providerAddress) {
    throw new Error('Both clientAddress and providerAddress are required');
  }
  if (!params.milestones || params.milestones.length === 0) {
    throw new Error('At least one milestone is required');
  }

  // Calculate parsed stroops for each milestone
  const parsedMilestones: Milestone[] = params.milestones.map((m, idx) => {
    const stroops = parseAmountToStroops(m.releaseAmount);
    if (stroops <= ZERO_BI) {
      throw new Error(`Milestone ${idx + 1} amount must be greater than zero`);
    }
    return {
      id: m.id ?? idx + 1,
      description: m.description || `Milestone ${idx + 1}`,
      releaseAmount: m.releaseAmount.includes('XLM') ? m.releaseAmount : `${m.releaseAmount} XLM`,
      releaseAmountStroops: stroops.toString(),
      status: 'pending',
    };
  });

  const sumMilestonesStroops = parsedMilestones.reduce(
    (acc, m) => acc + BigInt(m.releaseAmountStroops),
    ZERO_BI
  );

  let totalStroops: bigint;
  if (params.totalAmount) {
    totalStroops = parseAmountToStroops(params.totalAmount);
    if (totalStroops !== sumMilestonesStroops) {
      throw new Error(
        `Sum of milestone amounts (${formatStroopsToXlm(sumMilestonesStroops)}) does not equal total amount (${formatStroopsToXlm(totalStroops)})`
      );
    }
  } else {
    totalStroops = sumMilestonesStroops;
  }

  const now = new Date().toISOString();
  const id = params.customId || `esc_${Math.random().toString(36).substring(2, 9)}`;
  const dealIdNumeric = ++nextDealNumericCounter;

  const deal: EscrowMilestoneDeal = {
    id,
    dealIdNumeric,
    clientAddress: params.clientAddress,
    providerAddress: params.providerAddress,
    totalAmount: formatStroopsToXlm(totalStroops),
    totalAmountStroops: totalStroops.toString(),
    releasedAmountStroops: '0',
    refundedAmountStroops: '0',
    remainingLockedStroops: totalStroops.toString(), // 100% locked upfront
    status: 'active',
    milestones: parsedMilestones,
    currentMilestoneIndex: 0,
    createdAt: now,
    updatedAt: now,
    sorobanContractId: params.sorobanContractId || 'CCESCROW_SOROBAN_DEFAULT',
    history: [
      {
        action: 'created',
        actor: params.clientAddress,
        timestamp: now,
        details: {
          totalAmount: formatStroopsToXlm(totalStroops),
          milestoneCount: parsedMilestones.length,
        },
      },
    ],
  };

  if (!verifyEscrowInvariant(deal)) {
    throw new Error('Accounting invariant check failed on escrow creation');
  }

  globalEscrowStore.set(id, deal);
  return deal;
}

/**
 * Releases a specific milestone payment to the provider.
 * Idempotent: approving a milestone twice pays ONCE and does not alter balances.
 * Freezes: if escrow is disputed, throws an error.
 */
export function releaseMilestone(
  escrowId: string,
  milestoneId: number,
  actor: string
): { deal: EscrowMilestoneDeal; alreadyPaid: boolean } {
  const deal = globalEscrowStore.get(escrowId);
  if (!deal) {
    throw new Error(`Escrow with id "${escrowId}" not found`);
  }

  if (deal.status === 'disputed') {
    throw new Error('Cannot release milestone: escrow is currently disputed and locked');
  }
  if (deal.status === 'cancelled') {
    throw new Error('Cannot release milestone: escrow has been cancelled and refunded');
  }

  const milestoneIndex = deal.milestones.findIndex((m) => m.id === milestoneId);
  if (milestoneIndex === -1) {
    throw new Error(`Milestone with id ${milestoneId} not found in escrow "${escrowId}"`);
  }

  const targetMilestone = deal.milestones[milestoneIndex];

  // Double-Approval Idempotency Check: if already completed, return existing without paying again
  if (targetMilestone.status === 'completed') {
    return { deal, alreadyPaid: true };
  }

  const milestoneStroops = BigInt(targetMilestone.releaseAmountStroops);
  const currentLocked = BigInt(deal.remainingLockedStroops);
  const currentReleased = BigInt(deal.releasedAmountStroops);

  if (milestoneStroops > currentLocked) {
    throw new Error('Insufficient locked funds remaining to release milestone');
  }

  const now = new Date().toISOString();
  targetMilestone.status = 'completed';
  targetMilestone.completedAt = now;
  targetMilestone.completedBy = actor;

  const newReleased = currentReleased + milestoneStroops;
  const newLocked = currentLocked - milestoneStroops;

  deal.releasedAmountStroops = newReleased.toString();
  deal.remainingLockedStroops = newLocked.toString();
  deal.updatedAt = now;

  // Check if all milestones are completed
  const allCompleted = deal.milestones.every((m) => m.status === 'completed');
  if (allCompleted) {
    deal.status = 'completed';
    deal.history.push({
      action: 'auto_completed',
      actor: 'system',
      timestamp: now,
      details: { totalReleased: formatStroopsToXlm(newReleased) },
    });
  }

  deal.history.push({
    action: 'milestone_released',
    actor,
    timestamp: now,
    details: {
      milestoneId,
      amountReleased: targetMilestone.releaseAmount,
      newRemainingLocked: formatStroopsToXlm(newLocked),
    },
  });

  if (!verifyEscrowInvariant(deal)) {
    throw new Error('Accounting invariant check violated after milestone release');
  }

  globalEscrowStore.set(escrowId, deal);
  return { deal, alreadyPaid: false };
}

/**
 * Raises a dispute, freezing all remaining locked funds.
 * No further releases or refunds allowed until arbitration.
 */
export function raiseDispute(
  escrowId: string,
  actor: string,
  reason: string
): EscrowMilestoneDeal {
  const deal = globalEscrowStore.get(escrowId);
  if (!deal) {
    throw new Error(`Escrow with id "${escrowId}" not found`);
  }

  if (deal.status === 'disputed') {
    return deal; // Already disputed
  }
  if (deal.status === 'completed') {
    throw new Error('Cannot dispute an already completed escrow');
  }
  if (deal.status === 'cancelled') {
    throw new Error('Cannot dispute a cancelled escrow');
  }

  const now = new Date().toISOString();
  deal.status = 'disputed';
  deal.disputeReason = reason || 'Dispute raised by participant';
  deal.disputedAt = now;
  deal.disputedBy = actor;
  deal.updatedAt = now;

  deal.history.push({
    action: 'disputed',
    actor,
    timestamp: now,
    details: {
      reason: deal.disputeReason,
      remainingFrozenAmount: formatStroopsToXlm(BigInt(deal.remainingLockedStroops)),
    },
  });

  if (!verifyEscrowInvariant(deal)) {
    throw new Error('Accounting invariant check violated after dispute');
  }

  globalEscrowStore.set(escrowId, deal);
  return deal;
}

/**
 * Cancels the escrow prior to the first milestone release.
 * Returns 100% of deposited funds to the client.
 */
export function cancelEscrowEarly(
  escrowId: string,
  actor: string,
  reason: string
): EscrowMilestoneDeal {
  const deal = globalEscrowStore.get(escrowId);
  if (!deal) {
    throw new Error(`Escrow with id "${escrowId}" not found`);
  }

  if (BigInt(deal.releasedAmountStroops) > ZERO_BI) {
    throw new Error(
      'Cannot cancel escrow: one or more milestones have already been released. Raise a dispute instead.'
    );
  }
  if (deal.status === 'completed' || deal.status === 'cancelled') {
    throw new Error(`Cannot cancel escrow in "${deal.status}" state`);
  }

  const now = new Date().toISOString();
  const total = BigInt(deal.totalAmountStroops);

  deal.status = 'cancelled';
  deal.refundedAmountStroops = total.toString();
  deal.remainingLockedStroops = '0';
  deal.cancelledAt = now;
  deal.updatedAt = now;

  deal.history.push({
    action: 'cancelled',
    actor,
    timestamp: now,
    details: {
      reason: reason || 'Early cancellation before first milestone',
      refundedTo: deal.clientAddress,
      amountRefunded: formatStroopsToXlm(total),
    },
  });

  if (!verifyEscrowInvariant(deal)) {
    throw new Error('Accounting invariant check violated after early cancellation');
  }

  globalEscrowStore.set(escrowId, deal);
  return deal;
}
