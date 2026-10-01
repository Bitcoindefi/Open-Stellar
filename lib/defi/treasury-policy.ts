/**
 * Treasury Policy & Auto-Rebalancing Engine for Open-Stellar Agents
 *
 * All amounts are calculated strictly using integer units (Stroops / minimal units)
 * to avoid floating-point drift and financial loss.
 * 1 XLM = 10,000,000 stroops (7 decimals)
 */

export type SupportedAsset = 'XLM' | 'USDC' | 'BSTC';

export const ASSET_DECIMALS: Record<SupportedAsset, number> = {
  XLM: 7,
  USDC: 7,
  BSTC: 7,
};

export const STROOPS_PER_UNIT = 10_000_000n; // 10^7
export const BPS_DIVISOR = 10_000n; // 100% = 10,000 basis points

export interface AgentBalances {
  XLM: bigint;
  USDC: bigint;
  BSTC: bigint;
}

export type ComparisonOperator = 'GT' | 'LT' | 'GTE' | 'LTE';
export type ActionType = 'PERCENT' | 'FIXED';

export interface TreasuryRule {
  id: string;
  agentId: string;
  trigger: string; // e.g. "XLM > 100"
  action: string;  // e.g. "swap 50% XLM → USDC"
  triggerAsset: SupportedAsset;
  fromAsset: SupportedAsset;
  toAsset: SupportedAsset;
  condition: ComparisonOperator;
  thresholdAmount: bigint;
  actionType: ActionType;
  actionValue: bigint; // for PERCENT: basis points (5000n = 50%), for FIXED: minimal unit
  enabled?: boolean;
}

export interface TreasuryPolicyLimits {
  maxPerSwapAmount: bigint;       // Max amount in fromAsset per single swap
  maxDailyVolume: bigint;         // Max cumulative fromAsset amount in 24h
  minNetworkReserve: bigint;      // Required minimum XLM reserve to pay gas
  defaultMaxSlippageBps: number;  // Default max slippage in bps (50 = 0.5%)
}

export const DEFAULT_TREASURY_LIMITS: TreasuryPolicyLimits = {
  maxPerSwapAmount: 1_000n * STROOPS_PER_UNIT,     // 1,000 tokens
  maxDailyVolume: 5_000n * STROOPS_PER_UNIT,       // 5,000 tokens per 24h
  minNetworkReserve: 100_000n,                     // 0.01 XLM gas reserve
  defaultMaxSlippageBps: 50,                       // 0.5% (50 bps)
};

export interface SwapExecutionRecord {
  id: string;
  agentId: string;
  ruleId?: string;
  idempotencyKey?: string;
  fromAsset: SupportedAsset;
  toAsset: SupportedAsset;
  fromAmount: bigint;
  toAmount: bigint;
  rate: string;
  fee: bigint;
  txHash?: string;
  status: 'success' | 'failed';
  failureReason?: string;
  timestamp: number;
}

export interface SoroswapQuote {
  fromAsset: SupportedAsset;
  toAsset: SupportedAsset;
  fromAmount: bigint;
  toAmount: bigint;
  minimumToAmount: bigint;
  rate: string; // string representation of price
  slippageBps: number;
  networkFeeStroops: bigint;
}

export interface PolicyEvaluationDecision {
  shouldSwap: boolean;
  ruleId?: string;
  fromAsset?: SupportedAsset;
  toAsset?: SupportedAsset;
  swapAmount?: bigint;
  reason: string;
  idempotencyKey?: string;
}

/**
 * Converts a decimal string (e.g. "10.5") to minimal integer stroops (bigint)
 */
export function toStroops(amountStr: string | number, decimals = 7): bigint {
  const str = String(amountStr).trim();
  if (!str || isNaN(Number(str))) {
    throw new Error(`Invalid amount string: ${amountStr}`);
  }
  const [whole, fraction = ''] = str.split('.');
  const wholePart = BigInt(whole || '0') * (10n ** BigInt(decimals));
  const fractionPadded = fraction.slice(0, decimals).padEnd(decimals, '0');
  const fractionPart = BigInt(fractionPadded || '0');
  return wholePart + fractionPart;
}

/**
 * Converts minimal integer stroops (bigint) to a readable decimal string
 */
export function fromStroops(stroops: bigint, decimals = 7): string {
  const isNegative = stroops < 0n;
  const absStroops = isNegative ? -stroops : stroops;
  const divisor = 10n ** BigInt(decimals);
  const whole = absStroops / divisor;
  const fraction = absStroops % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  const sign = isNegative ? '-' : '';
  return fractionStr.length > 0 ? `${sign}${whole}.${fractionStr}` : `${sign}${whole}`;
}

/**
 * Parse trigger string e.g. "XLM > 100", "USDC < 20", "BSTC >= 1.5"
 */
export function parseTriggerString(trigger: string): {
  asset: SupportedAsset;
  condition: ComparisonOperator;
  threshold: bigint;
} {
  const match = trigger.trim().match(/^([A-Za-z]+)\s*(>=|<=|>|<|==)\s*([0-9.]+)/);
  if (!match) {
    throw new Error(`Malformed trigger expression: "${trigger}"`);
  }
  const [, rawAsset, rawOp, rawVal] = match;
  const asset = rawAsset.toUpperCase() as SupportedAsset;
  if (!ASSET_DECIMALS[asset]) {
    throw new Error(`Unsupported trigger asset: ${rawAsset}`);
  }

  let condition: ComparisonOperator = 'GT';
  if (rawOp === '>') condition = 'GT';
  else if (rawOp === '<') condition = 'LT';
  else if (rawOp === '>=') condition = 'GTE';
  else if (rawOp === '<=') condition = 'LTE';

  const threshold = toStroops(rawVal, ASSET_DECIMALS[asset]);
  return { asset, condition, threshold };
}

/**
 * Parse action string e.g. "swap 50% XLM → USDC", "swap 20 USDC → XLM"
 */
export function parseActionString(action: string): {
  actionType: ActionType;
  actionValue: bigint;
  fromAsset: SupportedAsset;
  toAsset: SupportedAsset;
} {
  // Support arrow variations: -> or →
  const normalized = action.replace(/->/g, '→').trim();
  const match = normalized.match(/swap\s+([0-9.]+(%?))\s+([A-Za-z]+)\s*→\s*([A-Za-z]+)/i);
  if (!match) {
    throw new Error(`Malformed action expression: "${action}"`);
  }

  const [, rawVal, isPercent, rawFrom, rawTo] = match;
  const fromAsset = rawFrom.toUpperCase() as SupportedAsset;
  const toAsset = rawTo.toUpperCase() as SupportedAsset;

  if (!ASSET_DECIMALS[fromAsset] || !ASSET_DECIMALS[toAsset]) {
    throw new Error(`Unsupported assets in action: ${rawFrom} -> ${rawTo}`);
  }

  if (isPercent) {
    const pctNum = parseFloat(rawVal.replace('%', ''));
    if (isNaN(pctNum) || pctNum <= 0 || pctNum > 100) {
      throw new Error(`Invalid percentage value in action: ${rawVal}`);
    }
    const bps = BigInt(Math.round(pctNum * 100));
    return { actionType: 'PERCENT', actionValue: bps, fromAsset, toAsset };
  } else {
    const fixedAmount = toStroops(rawVal, ASSET_DECIMALS[fromAsset]);
    return { actionType: 'FIXED', actionValue: fixedAmount, fromAsset, toAsset };
  }
}

/**
 * Creates a TreasuryRule from natural trigger & action strings
 */
export function createTreasuryRule(id: string, agentId: string, trigger: string, action: string): TreasuryRule {
  const t = parseTriggerString(trigger);
  const a = parseActionString(action);
  return {
    id,
    agentId,
    trigger,
    action,
    triggerAsset: t.asset,
    fromAsset: a.fromAsset,
    toAsset: a.toAsset,
    condition: t.condition,
    thresholdAmount: t.threshold,
    actionType: a.actionType,
    actionValue: a.actionValue,
    enabled: true,
  };
}

/**
 * Generates deterministic idempotency key for concurrency deduplication
 */
export function generateIdempotencyKey(agentId: string, ruleId: string, timeBucketMs: number, bucketDurationMs = 60_000): string {
  const bucket = Math.floor(timeBucketMs / bucketDurationMs);
  return `${agentId}:${ruleId}:${bucket}`;
}

/**
 * Pure evaluation function for Treasury auto-rebalance rules
 */
export function evaluateTreasuryRule(
  agentBalances: AgentBalances,
  rule: TreasuryRule,
  recentHistory: SwapExecutionRecord[] = [],
  nowMs = Date.now(),
  limits: TreasuryPolicyLimits = DEFAULT_TREASURY_LIMITS,
): PolicyEvaluationDecision {
  if (rule.enabled === false) {
    return { shouldSwap: false, reason: 'Rule is disabled' };
  }

  const triggerAsset = rule.triggerAsset || rule.fromAsset;
  const triggerBalance = agentBalances[triggerAsset] ?? 0n;
  const fromBalance = agentBalances[rule.fromAsset] ?? 0n;

  // 1. Threshold Condition Evaluation
  let conditionMet = false;
  switch (rule.condition) {
    case 'GT':
      conditionMet = triggerBalance > rule.thresholdAmount;
      break;
    case 'GTE':
      conditionMet = triggerBalance >= rule.thresholdAmount;
      break;
    case 'LT':
      conditionMet = triggerBalance < rule.thresholdAmount;
      break;
    case 'LTE':
      conditionMet = triggerBalance <= rule.thresholdAmount;
      break;
  }

  if (!conditionMet) {
    return {
      shouldSwap: false,
      reason: `Condition not met: ${triggerAsset} balance (${fromStroops(triggerBalance)}) not ${rule.condition} threshold (${fromStroops(rule.thresholdAmount)})`,
    };
  }

  // 2. Concurrency Idempotency Guard (Produce exactly ONE swap for duplicate triggers in window)
  const idempotencyKey = generateIdempotencyKey(rule.agentId, rule.id, nowMs, 60_000);
  const hasRecentExecution = recentHistory.some(
    (h) => h.idempotencyKey === idempotencyKey && h.status === 'success' && (nowMs - h.timestamp) < 60_000
  );

  if (hasRecentExecution) {
    return {
      shouldSwap: false,
      idempotencyKey,
      reason: 'Concurrent trigger suppressed: duplicate execution within idempotency window',
    };
  }

  // 3. Calculate Target Swap Amount
  let rawSwapAmount = 0n;
  if (rule.actionType === 'PERCENT') {
    rawSwapAmount = (fromBalance * rule.actionValue) / BPS_DIVISOR;
  } else {
    rawSwapAmount = rule.actionValue;
  }

  if (rawSwapAmount <= 0n) {
    return { shouldSwap: false, reason: 'Calculated swap amount is zero or negative' };
  }

  if (fromBalance < rawSwapAmount) {
    return {
      shouldSwap: false,
      reason: `Insufficient balance: requested ${fromStroops(rawSwapAmount)} ${rule.fromAsset}, but only ${fromStroops(fromBalance)} available`,
    };
  }

  // 4. Per-Swap Cap Check
  if (rawSwapAmount > limits.maxPerSwapAmount) {
    return {
      shouldSwap: false,
      reason: `Per-swap cap exceeded: requested ${fromStroops(rawSwapAmount)} exceeds cap ${fromStroops(limits.maxPerSwapAmount)} ${rule.fromAsset}`,
    };
  }

  // 5. Daily Cumulative Volume Cap Check
  const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
  const dailySwappedVolume = recentHistory
    .filter((h) => h.agentId === rule.agentId && h.fromAsset === rule.fromAsset && h.status === 'success' && h.timestamp >= oneDayAgo)
    .reduce((acc, h) => acc + h.fromAmount, 0n);

  if (dailySwappedVolume + rawSwapAmount > limits.maxDailyVolume) {
    return {
      shouldSwap: false,
      reason: `Daily volume limit exceeded: current 24h volume (${fromStroops(dailySwappedVolume)}) + swap (${fromStroops(rawSwapAmount)}) exceeds limit (${fromStroops(limits.maxDailyVolume)})`,
    };
  }

  // 6. Network Fee & Reserve Check
  // Agent must always preserve at least minNetworkReserve XLM to cover network operations
  if (rule.fromAsset === 'XLM') {
    if (fromBalance - rawSwapAmount < limits.minNetworkReserve) {
      return {
        shouldSwap: false,
        reason: `Insufficient network reserve: swap would leave less than ${fromStroops(limits.minNetworkReserve)} XLM for gas fees`,
      };
    }
  } else {
    // If swapping non-XLM asset, agent must still have gas reserve in XLM balance
    if ((agentBalances.XLM ?? 0n) < limits.minNetworkReserve) {
      return {
        shouldSwap: false,
        reason: `Insufficient gas reserve: agent has less than ${fromStroops(limits.minNetworkReserve)} XLM to pay transaction fee`,
      };
    }
  }

  return {
    shouldSwap: true,
    ruleId: rule.id,
    fromAsset: rule.fromAsset,
    toAsset: rule.toAsset,
    swapAmount: rawSwapAmount,
    idempotencyKey,
    reason: `Rule triggered successfully: ${rule.trigger} -> ${rule.action}`,
  };
}

/**
 * Validates a Soroswap quote against explicit slippage and structure criteria
 */
export function validateSwapQuote(
  quote: SoroswapQuote,
  maxSlippageBps: number = DEFAULT_TREASURY_LIMITS.defaultMaxSlippageBps
): { valid: boolean; reason?: string } {
  // 1. Structure validation
  if (!quote.fromAsset || !quote.toAsset) {
    return { valid: false, reason: 'Malformed quote: missing assets' };
  }
  if (quote.fromAsset === quote.toAsset) {
    return { valid: false, reason: 'Malformed quote: source and destination assets cannot be identical' };
  }
  if (quote.fromAmount <= 0n || quote.toAmount <= 0n) {
    return { valid: false, reason: 'Malformed quote: zero or negative amount' };
  }
  if (!quote.rate || isNaN(Number(quote.rate)) || Number(quote.rate) <= 0) {
    return { valid: false, reason: 'Malformed quote: invalid exchange rate' };
  }

  // 2. Slippage validation
  if (quote.slippageBps > maxSlippageBps) {
    return {
      valid: false,
      reason: `Slippage exceeded: quote slippage ${quote.slippageBps} bps exceeds maximum allowable ${maxSlippageBps} bps`,
    };
  }

  // 3. Minimum output validation
  const calculatedMinimum = (quote.toAmount * (BPS_DIVISOR - BigInt(maxSlippageBps))) / BPS_DIVISOR;
  if (quote.minimumToAmount < calculatedMinimum) {
    return {
      valid: false,
      reason: `Minimum output violation: provided minimum ${fromStroops(quote.minimumToAmount)} is lower than expected floor ${fromStroops(calculatedMinimum)}`,
    };
  }

  return { valid: true };
}
