import { NextResponse } from 'next/server';
import { executeSoroswap, getAgentSwapHistory } from '@/lib/defi/soroswap';
import { fromStroops, SupportedAsset } from '@/lib/defi/treasury-policy';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const agentId = decodeURIComponent(id);

    const body = await req.json();
    const { fromAsset, toAsset, amount, slippageTolerance } = body;

    if (!fromAsset || !toAsset || !amount) {
      return NextResponse.json(
        { ok: false, error: 'Missing required parameters: fromAsset, toAsset, amount' },
        { status: 400 }
      );
    }

    const result = await executeSoroswap({
      agentId,
      fromAsset: fromAsset.toUpperCase() as SupportedAsset,
      toAsset: toAsset.toUpperCase() as SupportedAsset,
      amount: String(amount),
      slippageTolerance: slippageTolerance !== undefined ? Number(slippageTolerance) : 0.005,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || 'Swap execution aborted',
          fromAsset: result.fromAsset,
          toAsset: result.toAsset,
          fromAmount: result.fromAmount,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      txHash: result.txHash,
      fromAmount: result.fromAmount,
      toAmount: result.toAmount,
      rate: result.rate,
      fee: result.fee,
      fromAsset: result.fromAsset,
      toAsset: result.toAsset,
      timestamp: result.timestamp,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const agentId = decodeURIComponent(id);
    const history = getAgentSwapHistory(agentId).map((item) => ({
      ...item,
      fromAmount: fromStroops(item.fromAmount),
      toAmount: fromStroops(item.toAmount),
      fee: fromStroops(item.fee),
    }));

    return NextResponse.json({
      ok: true,
      agentId,
      swaps: history,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
