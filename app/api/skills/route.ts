import { NextResponse } from 'next/server'
import { searchSkills } from '@/lib/skills/skills-registry'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q') ?? undefined
    const maxPriceParam = url.searchParams.get('maxPrice')
    const maxPrice = maxPriceParam ? Number(maxPriceParam) : undefined

    const skills = searchSkills({ q, maxPrice })

    return NextResponse.json(
      { ok: true, skills, count: skills.length },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to search skills' },
      { status: 500 },
    )
  }
}
