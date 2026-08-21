import type { NextRequest } from 'next/server'
import { authMiddleware } from '@/lib/auth/middleware'

export async function middleware(req: NextRequest) {
  return authMiddleware(req)
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
}
