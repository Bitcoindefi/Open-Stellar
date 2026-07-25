import { NextResponse } from 'next/server'

import {
  getLatestReputationCredential,
  verifyReputationCredential,
} from '@/lib/reputation/credential-client'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const credential = getLatestReputationCredential(id)

    if (!credential) {
      return NextResponse.json(
        { ok: false, error: 'No reputation credential has been issued for this agent' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const baseUrl = new URL(req.url).origin
    const shareUrl = new URL(credential.links.shareUrl, baseUrl).toString()
    const jsonUrl = new URL(credential.links.jsonUrl, baseUrl).toString()
    const credentialWithAbsoluteLinks = {
      ...credential,
      links: {
        ...credential.links,
        shareUrl,
        jsonUrl,
      },
    }

    return NextResponse.json(
      {
        ok: true,
        credential: credentialWithAbsoluteLinks,
        verification: verifyReputationCredential(credentialWithAbsoluteLinks),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed reading latest reputation credential' },
      { status: 500 },
    )
  }
}
