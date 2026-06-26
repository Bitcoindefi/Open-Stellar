import { NextResponse } from 'next/server'
import { getX402ReceiptById } from '@/lib/protocols/x402'

export async function GET(_req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params
  const receipt = getX402ReceiptById(receiptId)

  if (!receipt) {
    return NextResponse.json({ ok: false, error: 'Receipt not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, receipt })
}
