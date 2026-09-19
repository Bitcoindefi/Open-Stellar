import { NextResponse } from 'next/server';
import { releaseMilestone } from '@/lib/escrow/milestones';
import { sorobanEscrowClient } from '@/lib/protocols/escrow';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const milestoneId = Number(body.milestoneId);
    if (!milestoneId || Number.isNaN(milestoneId)) {
      return NextResponse.json(
        { ok: false, error: 'Valid milestoneId is required' },
        { status: 400 }
      );
    }

    const actor = body.actor ? String(body.actor) : 'orchestrator';

    const { deal, alreadyPaid } = releaseMilestone(id, milestoneId, actor);

    // If newly released, mirror on Soroban contract
    if (!alreadyPaid) {
      const milestone = deal.milestones.find((m) => m.id === milestoneId);
      if (milestone) {
        try {
          await sorobanEscrowClient.releaseMilestone({
            dealId: deal.dealIdNumeric,
            payer: deal.clientAddress,
            milestoneId,
            amountStroops: BigInt(milestone.releaseAmountStroops),
          });
        } catch (contractErr) {
          console.warn('Soroban contract milestone release warning:', contractErr);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      alreadyPaid,
      message: alreadyPaid
        ? 'Milestone was already approved and paid (idempotent call)'
        : 'Milestone released successfully',
      escrow: deal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to release milestone';
    const status = message.includes('disputed') || message.includes('cancelled') ? 409 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
