import { NextResponse } from 'next/server';
import { raiseDispute } from '@/lib/escrow/milestones';
import { sorobanEscrowClient } from '@/lib/protocols/escrow';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const actor = body.actor ? String(body.actor) : 'client';
    const reason = body.reason ? String(body.reason) : 'Dispute raised on milestone execution';

    const deal = raiseDispute(id, actor, reason);

    // Mirror on Soroban smart contract
    try {
      await sorobanEscrowClient.raiseDispute({
        dealId: deal.dealIdNumeric,
        actor,
      });
    } catch (contractErr) {
      console.warn('Soroban contract dispute raise warning:', contractErr);
    }

    return NextResponse.json({
      ok: true,
      message: 'Dispute raised successfully. Remaining escrow funds are now frozen pending arbitration.',
      escrow: deal,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to raise dispute',
      },
      { status: 400 }
    );
  }
}
