import { NextResponse } from 'next/server';
import {
  createEscrowDeal,
  getAllEscrows,
  type CreateEscrowParams,
} from '@/lib/escrow/milestones';
import { sorobanEscrowClient } from '@/lib/protocols/escrow';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const client = url.searchParams.get('client');
    const provider = url.searchParams.get('provider');

    let escrows = getAllEscrows();
    if (status && status !== 'all') {
      escrows = escrows.filter((e) => e.status === status);
    }
    if (client) {
      escrows = escrows.filter((e) => e.clientAddress.toLowerCase() === client.toLowerCase());
    }
    if (provider) {
      escrows = escrows.filter((e) => e.providerAddress.toLowerCase() === provider.toLowerCase());
    }

    return NextResponse.json({
      ok: true,
      count: escrows.length,
      escrows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to list escrows',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.clientAddress || !body.providerAddress) {
      return NextResponse.json(
        { ok: false, error: 'clientAddress and providerAddress are required' },
        { status: 400 }
      );
    }

    if (!body.milestones || !Array.isArray(body.milestones) || body.milestones.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'At least one milestone is required' },
        { status: 400 }
      );
    }

    const params: CreateEscrowParams = {
      clientAddress: String(body.clientAddress),
      providerAddress: String(body.providerAddress),
      totalAmount: body.totalAmount ? String(body.totalAmount) : undefined,
      milestones: body.milestones,
      customId: body.id ? String(body.id) : undefined,
    };

    const deal = createEscrowDeal(params);

    // Register on Soroban Escrow Contract (simulated or testnet)
    try {
      await sorobanEscrowClient.createDeal({
        dealId: deal.dealIdNumeric,
        payer: deal.clientAddress,
        payee: deal.providerAddress,
        amountStroops: BigInt(deal.totalAmountStroops),
        metadata: JSON.stringify({
          escrowId: deal.id,
          milestoneCount: deal.milestones.length,
        }),
      });
    } catch (contractErr) {
      // Contract simulated recording fallback
      console.warn('Soroban contract initialization warning:', contractErr);
    }

    return NextResponse.json(
      {
        ok: true,
        escrow: deal,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to create escrow',
      },
      { status: 400 }
    );
  }
}
