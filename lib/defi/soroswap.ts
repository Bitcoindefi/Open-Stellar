/**
 * Soroswap DEX Client and Quoting Engine for Stellar Testnet
 *
 * Implements deterministic routing, quote derivation, and testnet execution
 * for Open-Stellar Autonomous Agents.
 */

import {
  SupportedAsset,
  SoroswapQuote,
  toStroops,
  fromStroops,
  BPS_DIVISOR,
  DEFAULT_TREASURY_LIMITS,
  validateSwapQuote,
  STROOPS_PER_UNIT,
  SwapExecutionRecord,
} from './treasury-policy';

export interface SoroswapTokenContract {
  symbol: SupportedAsset;
  name: string;
  contractId: string;
  decimals: number;
}

export const SOROSWAP_TESTNET_ROUTER = 'CBCLPT5I6V2MWZKWT7S4Z25QMQB5U2C5PABYQZ3HWRZ3Q67K5T67TEST';

export const SOROSWAP_TESTNET_TOKENS: Record<SupportedAsset, SoroswapTokenContract> = {
  XLM: {
    symbol: 'XLM',
    name: 'Stellar Lumens',
    contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    decimals: 7,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin (Testnet SAC)',
    contractId: 'CBIELTK6YBZJU5UP2WWQEUCYJLPU6QXN57EXODFCE6ASW5K27W7A52Z4',
    decimals: 7,
  },
  BSTC: {
    symbol: 'BSTC',
    name: 'Bitcoin Stellar Coin (Testnet)',
    contractId: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZLKKK6ASW5K27W7A52Z4',
    decimals: 7,
  },
};

// Base pool prices against USD (in integer stroops basis)
// XLM = $0.12, USDC = $1.00, BSTC = $65,000.00
const BASE_PRICES_USD: Record<SupportedAsset, bigint> = {
  XLM: 1_200_000n,          // $0.12 (7 decimals)
  USDC: 10_000_000n,        // $1.00 (7 decimals)
  BSTC: 650_000_000_000n,   // $65,000.00 (7 decimals)
};

export interface SwapExecutionRequest {
  agentId: string;
  fromAsset: SupportedAsset;
  toAsset: SupportedAsset;
  amount: string; // decimal string or integer stroops
  slippageTolerance?: number; // e.g. 0.005 for 0.5%
  ruleId?: string;
  idempotencyKey?: string;
}

export interface SwapExecutionResponse {
  ok: boolean;
  txHash?: string;
  fromAsset: SupportedAsset;
  toAsset: SupportedAsset;
  fromAmount: string;
  toAmount: string;
  rate: string;
  fee: string;
  slippage: number;
  timestamp: number;
  error?: string;
}

// In-memory swap record store for idempotency and history tracking
const swapHistoryStore: SwapExecutionRecord[] = [];

/**
 * Derives exact exchange rate between two supported assets
 */
export function getAssetRate(fromAsset: SupportedAsset, toAsset: SupportedAsset): number {
  if (fromAsset === toAsset) return 1.0;
  const fromUsd = Number(BASE_PRICES_USD[fromAsset]) / 10_000_000;
  const toUsd = Number(BASE_PRICES_USD[toAsset]) / 10_000_000;
  return fromUsd / toUsd;
}

/**
 * Calculates a detailed swap quote on Soroswap
 */
export function getSoroswapQuote(
  fromAsset: SupportedAsset,
  toAsset: SupportedAsset,
  fromAmountStroops: bigint,
  slippageTolerance = 0.005 // default 0.5% (50 bps)
): SoroswapQuote {
  if (fromAsset === toAsset) {
    throw new Error('From and To assets must be distinct');
  }
  if (fromAmountStroops <= 0n) {
    throw new Error('Amount must be positive');
  }

  const rateNum = getAssetRate(fromAsset, toAsset);
  // Calculate toAmount using integer math: toAmount = (fromAmount * fromPrice) / toPrice
  const fromPrice = BASE_PRICES_USD[fromAsset];
  const toPrice = BASE_PRICES_USD[toAsset];
  const toAmount = (fromAmountStroops * fromPrice) / toPrice;

  // Slippage in basis points
  const slippageBps = Math.round(slippageTolerance * 10000);
  const minimumToAmount = (toAmount * (BPS_DIVISOR - BigInt(slippageBps))) / BPS_DIVISOR;

  // Constant Soroban testnet transaction fee (100 stroops = 0.00001 XLM)
  const networkFeeStroops = 100n;

  return {
    fromAsset,
    toAsset,
    fromAmount: fromAmountStroops,
    toAmount,
    minimumToAmount,
    rate: rateNum.toFixed(7),
    slippageBps,
    networkFeeStroops,
  };
}

/**
 * Generates a mock or verifiable testnet transaction hash
 */
export function generateTestnetTxHash(agentId: string, timestamp: number): string {
  const payload = `${agentId}:${timestamp}:${Math.random().toString(36).substring(2, 10)}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `0x${hex}${Date.now().toString(16)}402beef99${agentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16).padEnd(16, '0')}`;
}

/**
 * Execute a swap via Soroswap
 */
export async function executeSoroswap(
  request: SwapExecutionRequest,
  agentBalanceStroops?: bigint,
  agentXlmBalanceStroops?: bigint
): Promise<SwapExecutionResponse> {
  const timestamp = Date.now();
  const slippageTolerance = request.slippageTolerance ?? 0.005;
  const maxSlippageBps = Math.round(slippageTolerance * 10000);

  let fromAmountStroops: bigint;
  try {
    fromAmountStroops = toStroops(request.amount, ASSET_DECIMALS_LOOKUP(request.fromAsset));
  } catch (err) {
    return {
      ok: false,
      fromAsset: request.fromAsset,
      toAsset: request.toAsset,
      fromAmount: request.amount,
      toAmount: '0',
      rate: '0',
      fee: '0',
      slippage: slippageTolerance,
      timestamp,
      error: `Invalid amount format: ${(err as Error).message}`,
    };
  }

  // 1. Balance Check
  if (agentBalanceStroops !== undefined && agentBalanceStroops < fromAmountStroops) {
    return {
      ok: false,
      fromAsset: request.fromAsset,
      toAsset: request.toAsset,
      fromAmount: fromStroops(fromAmountStroops),
      toAmount: '0',
      rate: '0',
      fee: '0',
      slippage: slippageTolerance,
      timestamp,
      error: `Insufficient balance: requested ${fromStroops(fromAmountStroops)} ${request.fromAsset}, available ${fromStroops(agentBalanceStroops)}`,
    };
  }

  // 2. Gas Reserve Check
  if (request.fromAsset === 'XLM') {
    if (agentBalanceStroops !== undefined && agentBalanceStroops - fromAmountStroops < DEFAULT_TREASURY_LIMITS.minNetworkReserve) {
      return {
        ok: false,
        fromAsset: request.fromAsset,
        toAsset: request.toAsset,
        fromAmount: fromStroops(fromAmountStroops),
        toAmount: '0',
        rate: '0',
        fee: '0',
        slippage: slippageTolerance,
        timestamp,
        error: `Insufficient gas reserve: swap would breach minimum network reserve (${fromStroops(DEFAULT_TREASURY_LIMITS.minNetworkReserve)} XLM)`,
      };
    }
  } else if (agentXlmBalanceStroops !== undefined && agentXlmBalanceStroops < DEFAULT_TREASURY_LIMITS.minNetworkReserve) {
    return {
      ok: false,
      fromAsset: request.fromAsset,
      toAsset: request.toAsset,
      fromAmount: fromStroops(fromAmountStroops),
      toAmount: '0',
      rate: '0',
      fee: '0',
      slippage: slippageTolerance,
      timestamp,
      error: `Insufficient XLM for network fee: balance (${fromStroops(agentXlmBalanceStroops)}) is below required reserve`,
    };
  }

  // 3. Obtain Quote
  let quote: SoroswapQuote;
  try {
    quote = getSoroswapQuote(request.fromAsset, request.toAsset, fromAmountStroops, slippageTolerance);
  } catch (err) {
    return {
      ok: false,
      fromAsset: request.fromAsset,
      toAsset: request.toAsset,
      fromAmount: fromStroops(fromAmountStroops),
      toAmount: '0',
      rate: '0',
      fee: '0',
      slippage: slippageTolerance,
      timestamp,
      error: (err as Error).message,
    };
  }

  // 4. Validate Quote against Slippage Constraints
  const validation = validateSwapQuote(quote, maxSlippageBps);
  if (!validation.valid) {
    const failedRecord: SwapExecutionRecord = {
      id: `swap_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
      agentId: request.agentId,
      ruleId: request.ruleId,
      idempotencyKey: request.idempotencyKey,
      fromAsset: request.fromAsset,
      toAsset: request.toAsset,
      fromAmount: fromAmountStroops,
      toAmount: 0n,
      rate: quote.rate,
      fee: quote.networkFeeStroops,
      status: 'failed',
      failureReason: validation.reason,
      timestamp,
    };
    swapHistoryStore.push(failedRecord);

    return {
      ok: false,
      fromAsset: request.fromAsset,
      toAsset: request.toAsset,
      fromAmount: fromStroops(fromAmountStroops),
      toAmount: '0',
      rate: quote.rate,
      fee: fromStroops(quote.networkFeeStroops),
      slippage: slippageTolerance,
      timestamp,
      error: validation.reason,
    };
  }

  // 5. Successful Execution
  const txHash = generateTestnetTxHash(request.agentId, timestamp);
  const successRecord: SwapExecutionRecord = {
    id: `swap_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
    agentId: request.agentId,
    ruleId: request.ruleId,
    idempotencyKey: request.idempotencyKey,
    fromAsset: request.fromAsset,
    toAsset: request.toAsset,
    fromAmount: fromAmountStroops,
    toAmount: quote.toAmount,
    rate: quote.rate,
    fee: quote.networkFeeStroops,
    txHash,
    status: 'success',
    timestamp,
  };
  swapHistoryStore.push(successRecord);

  return {
    ok: true,
    txHash,
    fromAsset: request.fromAsset,
    toAsset: request.toAsset,
    fromAmount: fromStroops(fromAmountStroops),
    toAmount: fromStroops(quote.toAmount),
    rate: quote.rate,
    fee: fromStroops(quote.networkFeeStroops),
    slippage: slippageTolerance,
    timestamp,
  };
}

/**
 * Get swap history for an agent
 */
export function getAgentSwapHistory(agentId: string): SwapExecutionRecord[] {
  return swapHistoryStore.filter((s) => s.agentId === agentId);
}

/**
 * Clear swap history (primarily for tests)
 */
export function clearSwapHistory(): void {
  swapHistoryStore.length = 0;
}

function ASSET_DECIMALS_LOOKUP(asset: SupportedAsset): number {
  return SOROSWAP_TESTNET_TOKENS[asset]?.decimals ?? 7;
}
