import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateTreasuryRule,
  createTreasuryRule,
  validateSwapQuote,
  toStroops,
  fromStroops,
  AgentBalances,
  DEFAULT_TREASURY_LIMITS,
  generateIdempotencyKey,
  SoroswapQuote,
} from '@/lib/defi/treasury-policy';
import {
  executeSoroswap,
  clearSwapHistory,
  getSoroswapQuote,
  getAssetRate,
} from '@/lib/defi/soroswap';

describe('Treasury Policy & Soroswap DEX Integration Test Suite', () => {
  const agentId = 'nexus-7';

  beforeEach(() => {
    clearSwapHistory();
  });

  describe('1. Threshold Trigger Evaluation (Dispara sobre el umbral y no debajo)', () => {
    const rule = createTreasuryRule(
      'rule_xlm_surplus',
      agentId,
      'XLM > 100',
      'swap 50% XLM → USDC'
    );

    it('triggers swap when balance is strictly above threshold', () => {
      const balances: AgentBalances = {
        XLM: toStroops('150'), // 150 XLM > 100 XLM
        USDC: toStroops('10'),
        BSTC: 0n,
      };

      const decision = evaluateTreasuryRule(balances, rule, [], 1_000_000);
      expect(decision.shouldSwap).toBe(true);
      expect(decision.fromAsset).toBe('XLM');
      expect(decision.toAsset).toBe('USDC');
      // 50% of 150 XLM = 75 XLM
      expect(decision.swapAmount).toBe(toStroops('75'));
    });

    it('does NOT trigger when balance is equal to or below threshold', () => {
      const balancesEqual: AgentBalances = {
        XLM: toStroops('100'), // 100 XLM is NOT > 100
        USDC: toStroops('10'),
        BSTC: 0n,
      };

      const decisionEqual = evaluateTreasuryRule(balancesEqual, rule, [], 1_000_000);
      expect(decisionEqual.shouldSwap).toBe(false);
      expect(decisionEqual.reason).toContain('Condition not met');

      const balancesBelow: AgentBalances = {
        XLM: toStroops('99.99'),
        USDC: toStroops('10'),
        BSTC: 0n,
      };

      const decisionBelow = evaluateTreasuryRule(balancesBelow, rule, [], 1_000_000);
      expect(decisionBelow.shouldSwap).toBe(false);
      expect(decisionBelow.reason).toContain('Condition not met');
    });

    it('handles low-threshold replenishing rule (e.g. XLM < 10)', () => {
      const replenishRule = createTreasuryRule(
        'rule_replenish',
        agentId,
        'XLM < 10',
        'swap 20 USDC → XLM'
      );

      const balancesLow: AgentBalances = {
        XLM: toStroops('5'), // 5 < 10
        USDC: toStroops('50'),
        BSTC: 0n,
      };

      const decision = evaluateTreasuryRule(balancesLow, replenishRule, [], 1_000_000);
      expect(decision.shouldSwap).toBe(true);
      expect(decision.fromAsset).toBe('USDC');
      expect(decision.toAsset).toBe('XLM');
      expect(decision.swapAmount).toBe(toStroops('20'));
    });
  });

  describe('2. Slippage Constraints & Abort (Slippage excedido aborta)', () => {
    it('aborts quote validation if slippage exceeds allowable tolerance', () => {
      const quote: SoroswapQuote = {
        fromAsset: 'XLM',
        toAsset: 'USDC',
        fromAmount: toStroops('100'),
        toAmount: toStroops('12'),
        minimumToAmount: toStroops('11.5'),
        rate: '0.12',
        slippageBps: 150, // 1.5% > default 0.5% (50 bps)
        networkFeeStroops: 100n,
      };

      const validation = validateSwapQuote(quote, 50); // max 50 bps
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Slippage exceeded');
    });

    it('aborts execution when swap requested with excessive slippage', async () => {
      const res = await executeSoroswap(
        {
          agentId,
          fromAsset: 'XLM',
          toAsset: 'USDC',
          amount: '50',
          slippageTolerance: 0.05, // 5% requested
        },
        toStroops('100'),
        toStroops('100')
      );

      // In default policy limits, max is 0.5% (50 bps)
      const quote = getSoroswapQuote('XLM', 'USDC', toStroops('50'), 0.05);
      const validation = validateSwapQuote(quote, 50);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Slippage exceeded');
    });
  });

  describe('3. Concurrency Idempotency (Doble disparo concurrente hace un solo swap)', () => {
    const rule = createTreasuryRule(
      'rule_rebalance_concurrent',
      agentId,
      'XLM > 100',
      'swap 50% XLM → USDC'
    );

    it('suppresses second execution when two identical triggers arrive concurrently', () => {
      const balances: AgentBalances = {
        XLM: toStroops('200'),
        USDC: toStroops('0'),
        BSTC: 0n,
      };

      const now = 1_700_000_000_000;
      const key = generateIdempotencyKey(agentId, rule.id, now);

      // First evaluation passes
      const firstDecision = evaluateTreasuryRule(balances, rule, [], now);
      expect(firstDecision.shouldSwap).toBe(true);
      expect(firstDecision.idempotencyKey).toBe(key);

      // Record first execution into history
      const history = [
        {
          id: 'swap_1',
          agentId,
          ruleId: rule.id,
          idempotencyKey: key,
          fromAsset: 'XLM' as const,
          toAsset: 'USDC' as const,
          fromAmount: toStroops('100'),
          toAmount: toStroops('12'),
          rate: '0.12',
          fee: 100n,
          status: 'success' as const,
          timestamp: now + 500, // 500ms later in same window
        },
      ];

      // Second concurrent evaluation is suppressed
      const secondDecision = evaluateTreasuryRule(balances, rule, history, now + 1_000);
      expect(secondDecision.shouldSwap).toBe(false);
      expect(secondDecision.reason).toContain('Concurrent trigger suppressed');
    });
  });

  describe('4. Daily Cumulative Volume Limit (El tope diario corta)', () => {
    const rule = createTreasuryRule(
      'rule_daily_cap',
      agentId,
      'XLM > 500',
      'swap 100 XLM → USDC'
    );

    it('cuts off execution when cumulative 24h volume reaches limit', () => {
      const now = 1_700_000_000_000;
      const limits = {
        ...DEFAULT_TREASURY_LIMITS,
        maxDailyVolume: toStroops('500'), // Cap at 500 XLM daily
      };

      const balances: AgentBalances = {
        XLM: toStroops('2000'),
        USDC: 0n,
        BSTC: 0n,
      };

      // Past 24h history already has 450 XLM swapped
      const history = [
        {
          id: 'swap_prev_1',
          agentId,
          fromAsset: 'XLM' as const,
          toAsset: 'USDC' as const,
          fromAmount: toStroops('450'),
          toAmount: toStroops('54'),
          rate: '0.12',
          fee: 100n,
          status: 'success' as const,
          timestamp: now - 3_600_000, // 1 hour ago
        },
      ];

      // Requesting 100 XLM more would exceed 500 XLM daily cap (450 + 100 = 550 > 500)
      const decision = evaluateTreasuryRule(balances, rule, history, now, limits);
      expect(decision.shouldSwap).toBe(false);
      expect(decision.reason).toContain('Daily volume limit exceeded');
    });
  });

  describe('5. Malformed Quotes Rejection (Cotización malformada se rechaza)', () => {
    it('rejects quote with negative amounts', () => {
      const badQuote: SoroswapQuote = {
        fromAsset: 'XLM',
        toAsset: 'USDC',
        fromAmount: -100n,
        toAmount: toStroops('10'),
        minimumToAmount: toStroops('9'),
        rate: '0.12',
        slippageBps: 20,
        networkFeeStroops: 100n,
      };

      const res = validateSwapQuote(badQuote);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('zero or negative amount');
    });

    it('rejects quote with identical from and to assets', () => {
      const badQuote: SoroswapQuote = {
        fromAsset: 'XLM',
        toAsset: 'XLM',
        fromAmount: toStroops('10'),
        toAmount: toStroops('10'),
        minimumToAmount: toStroops('9.9'),
        rate: '1.0',
        slippageBps: 10,
        networkFeeStroops: 100n,
      };

      const res = validateSwapQuote(badQuote);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('source and destination assets cannot be identical');
    });

    it('rejects quote with invalid exchange rate', () => {
      const badQuote: SoroswapQuote = {
        fromAsset: 'XLM',
        toAsset: 'USDC',
        fromAmount: toStroops('10'),
        toAmount: toStroops('10'),
        minimumToAmount: toStroops('9.9'),
        rate: 'invalid_rate',
        slippageBps: 10,
        networkFeeStroops: 100n,
      };

      const res = validateSwapQuote(badQuote);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('invalid exchange rate');
    });
  });

  describe('6. Balance Preservation on Failure & Network Fee Reserve', () => {
    it('aborts swap if it would breach minimum gas reserve', () => {
      const rule = createTreasuryRule('rule_gas', agentId, 'XLM > 10', 'swap 10 XLM → USDC');
      const balances: AgentBalances = {
        XLM: toStroops('10.005'), // Only 0.005 XLM left after swap, below 0.01 XLM reserve
        USDC: 0n,
        BSTC: 0n,
      };

      const decision = evaluateTreasuryRule(balances, rule, []);
      expect(decision.shouldSwap).toBe(false);
      expect(decision.reason).toContain('Insufficient network reserve');
    });

    it('preserves balances when executeSoroswap fails due to insufficient funds', async () => {
      const initialBalance = toStroops('5');
      const res = await executeSoroswap(
        {
          agentId,
          fromAsset: 'XLM',
          toAsset: 'USDC',
          amount: '100', // Demanding 100 XLM when agent only has 5 XLM
        },
        initialBalance,
        initialBalance
      );

      expect(res.ok).toBe(false);
      expect(res.error).toContain('Insufficient balance');
    });
  });

  describe('7. Integer-Only Arithmetic (Sin punto flotante)', () => {
    it('converts decimal amounts to exact integer stroops without precision loss', () => {
      const stroops1 = toStroops('10.1234567');
      expect(stroops1).toBe(101_234_567n);

      const formatted = fromStroops(stroops1);
      expect(formatted).toBe('10.1234567');

      const small = toStroops('0.0000001');
      expect(small).toBe(1n);
      expect(fromStroops(small)).toBe('0.0000001');
    });

    it('calculates integer price ratios accurately', () => {
      const quote = getSoroswapQuote('XLM', 'USDC', toStroops('100'));
      // 100 XLM @ $0.12 = 12 USDC
      expect(quote.toAmount).toBe(toStroops('12'));
      expect(fromStroops(quote.toAmount)).toBe('12');
    });
  });
});
