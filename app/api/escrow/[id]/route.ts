import { NextResponse } from 'next/server';
import { getEscrowById } from '@/lib/escrow/milestones';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deal = getEscrowById(id);

    if (!deal) {
      return NextResponse.json(
        { ok: false, error: `Escrow deal with id "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      escrow: deal,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
