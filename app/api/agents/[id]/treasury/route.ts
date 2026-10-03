import { NextResponse } from 'next/server';
import {
  TreasuryRule,
  AgentBalances,
  createTreasuryRule,
  evaluateTreasuryRule,
  fromStroops,
  toStroops,
  DEFAULT_TREASURY_LIMITS,
} from '@/lib/defi/treasury-policy';
import { executeSoroswap, getAgentSwapHistory } from '@/lib/defi/soroswap';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// In-memory agent treasury policy rules store
const agentRulesStore = new Map<string, TreasuryRule[]>();

// Mock balance state for testing and execution
const agentBalancesStore = new Map<string, AgentBalances>();

function getOrCreateAgentBalances(agentId: string): AgentBalances {
  if (!agentBalancesStore.has(agentId)) {
    agentBalancesStore.set(agentId, {
      XLM: 250n * 10_000_000n, // Default 250 XLM
      USDC: 50n * 10_000_000n,  // Default 50 USDC
      BSTC: 0n,
    });
  }
  return agentBalancesStore.get(agentId)!;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const agentId = decodeURIComponent(id);
    const rules = agentRulesStore.get(agentId) || [];
    const balances = getOrCreateAgentBalances(agentId);

    return NextResponse.json({
      ok: true,
      agentId,
      balances: {
        XLM: fromStroops(balances.XLM),
        USDC: fromStroops(balances.USDC),
        BSTC: fromStroops(balances.BSTC),
      },
      rules: rules.map((r) => ({
        id: r.id,
        trigger: r.trigger,
        action: r.action,
        fromAsset: r.fromAsset,
        toAsset: r.toAsset,
        condition: r.condition,
        threshold: fromStroops(r.thresholdAmount),
        enabled: r.enabled !== false,
      })),
      limits: {
        maxPerSwap: fromStroops(DEFAULT_TREASURY_LIMITS.maxPerSwapAmount),
        maxDailyVolume: fromStroops(DEFAULT_TREASURY_LIMITS.maxDailyVolume),
        minNetworkReserve: fromStroops(DEFAULT_TREASURY_LIMITS.minNetworkReserve),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const agentId = decodeURIComponent(id);
    const body = await req.json();

    // Mode 1: Update or add auto-rebalance rules
    if (body.rules && Array.isArray(body.rules)) {
      const parsedRules: TreasuryRule[] = body.rules.map((r: { trigger: string; action: string; id?: string }, idx: number) => {
        const ruleId = r.id || `rule_${agentId}_${Date.now()}_${idx}`;
        return createTreasuryRule(ruleId, agentId, r.trigger, r.action);
      });
      agentRulesStore.set(agentId, parsedRules);
      return NextResponse.json({
        ok: true,
        agentId,
        message: `Configured ${parsedRules.length} treasury rules`,
        rules: parsedRules,
      });
    }

    // Mode 2: Trigger rebalance evaluation
    if (body.action === 'evaluate' || body.evaluate === true) {
      const balances = getOrCreateAgentBalances(agentId);
      const rules = agentRulesStore.get(agentId) || [];
      const history = getAgentSwapHistory(agentId);

      const executedSwaps = [];
      const skippedDecisions = [];

      for (const rule of rules) {
        const decision = evaluateTreasuryRule(balances, rule, history, Date.now());
        if (decision.shouldSwap && decision.fromAsset && decision.toAsset && decision.swapAmount) {
          const swapRes = await executeSoroswap(
            {
              agentId,
              ruleId: rule.id,
              fromAsset: decision.fromAsset,
              toAsset: decision.toAsset,
              amount: fromStroops(decision.swapAmount),
              idempotencyKey: decision.idempotencyKey,
            },
            balances[decision.fromAsset],
            balances.XLM
          );

          if (swapRes.ok) {
            // Update balances on successful swap
            balances[decision.fromAsset] -= decision.swapAmount;
            balances[decision.toAsset] += toStroops(swapRes.toAmount);
            executedSwaps.push(swapRes);
          } else {
            skippedDecisions.push({ ruleId: rule.id, reason: swapRes.error });
          }
        } else {
          skippedDecisions.push({ ruleId: rule.id, reason: decision.reason });
        }
      }

      return NextResponse.json({
        ok: true,
        agentId,
        evaluatedRules: rules.length,
        executedSwaps,
        skippedDecisions,
        updatedBalances: {
          XLM: fromStroops(balances.XLM),
          USDC: fromStroops(balances.USDC),
          BSTC: fromStroops(balances.BSTC),
        },
      });
    }

    return NextResponse.json({ ok: false, error: 'Unrecognized action or payload format' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
