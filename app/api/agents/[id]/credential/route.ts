import { NextResponse } from 'next/server'

import {
  issueReputationCredential,
  verifyReputationCredential,
} from '@/lib/reputation/credential-client'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function readContractId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('contractId' in body)) return undefined
  const contractId = String(body.contractId).trim()
  return contractId.length > 0 ? contractId : undefined
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    let body: unknown

    try {
      body = await req.json()
    } catch {
      body = undefined
    }

    const credential = issueReputationCredential(id, {
      baseUrl: new URL(req.url).origin,
      contractId: readContractId(body),
    })

    return NextResponse.json(
      {
        ok: true,
        credential,
        txHash: credential.proof.transactionHash,
        shareUrl: credential.links.shareUrl,
        verification: verifyReputationCredential(credential),
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed issuing reputation credential' },
      { status: 500 },
    )
  }
}
