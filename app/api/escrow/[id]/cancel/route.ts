import { NextResponse } from 'next/server';
import { cancelEscrowEarly } from '@/lib/escrow/milestones';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { actor?: string; reason?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const actor = body.actor ? String(body.actor) : 'client';
    const reason = body.reason ? String(body.reason) : 'Early cancellation before work started';

    const deal = cancelEscrowEarly(id, actor, reason);

    return NextResponse.json({
      ok: true,
      message: 'Escrow cancelled successfully. 100% of deposited funds have been refunded to the client.',
      escrow: deal,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to cancel escrow',
      },
      { status: 400 }
    );
  }
}
