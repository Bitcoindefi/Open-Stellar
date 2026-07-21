/**
 * Minimal next/server mock for vitest.
 * NextResponse wraps the standard Web Response API.
 */

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit): NextResponse {
    const json = JSON.stringify(body)
    const headers = new Headers(init?.headers)
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    return new NextResponse(json, { ...init, headers })
  }

  static redirect(url: string | URL, init?: number | ResponseInit): NextResponse {
    const status = typeof init === "number" ? init : (init?.status ?? 302)
    const headers = new Headers(typeof init === "number" ? {} : (init?.headers ?? {}))
    headers.set("Location", String(url))
    return new NextResponse(null, { status, headers })
  }

  static rewrite(destination: string | URL): NextResponse {
    const headers = new Headers()
    headers.set("x-middleware-rewrite", String(destination))
    return new NextResponse(null, { headers })
  }

  static next(init?: ResponseInit): NextResponse {
    return new NextResponse(null, init)
  }
}

export class NextRequest extends Request {
  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init)
  }
}
