import { NextResponse } from 'next/server'
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  type CreateApiKeyInput,
} from '@/lib/auth/api-keys'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request) {
  try {
    const keys = await listApiKeys()
    return NextResponse.json(
      { ok: true, keys },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed listing API keys' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateApiKeyInput
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Name is required' },
        { status: 400 },
      )
    }

    const result = await createApiKey({
      name: body.name,
      scopes: Array.isArray(body.scopes) ? body.scopes : [],
      tier: body.tier,
      expiresAt: body.expiresAt,
    })

    return NextResponse.json(
      {
        ok: true,
        id: result.id,
        key: result.key,
        name: result.name,
        keyPrefix: result.keyPrefix,
        scopes: result.scopes,
        tier: result.tier,
        expiresAt: result.expiresAt,
        createdAt: result.createdAt,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed creating API key' },
      { status: 400 },
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = body.id || ''
    const action = body.action || ''

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Key id is required' }, { status: 400 })
    }

    if (action === 'revoke') {
      const revoked = await revokeApiKey(id)
      if (!revoked) {
        return NextResponse.json({ ok: false, error: 'Key not found or already revoked' }, { status: 404 })
      }
      return NextResponse.json({ ok: true, id, status: 'revoked' })
    }

    if (action === 'rotate') {
      const rotated = await rotateApiKey(id)
      if (!rotated) {
        return NextResponse.json({ ok: false, error: 'Key not found' }, { status: 404 })
      }
      return NextResponse.json({
        ok: true,
        id: rotated.id,
        key: rotated.key,
        keyPrefix: rotated.keyPrefix,
        status: 'active',
      })
    }

    return NextResponse.json({ ok: false, error: 'Invalid action (must be revoke or rotate)' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed updating API key' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Key id is required' }, { status: 400 })
    }

    const revoked = await revokeApiKey(id)
    if (!revoked) {
      return NextResponse.json({ ok: false, error: 'Key not found or already revoked' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, id, status: 'revoked' })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed revoking API key' },
      { status: 500 },
    )
  }
}
