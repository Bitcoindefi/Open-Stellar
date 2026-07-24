import { NextResponse } from 'next/server'
import { Logtail } from '@logtail/node'
import { getCorrelationId, extractTraceContext, setTraceContext } from '@/lib/observability/tracing'

export type ApiLogLevel = 'info' | 'warn' | 'error'

export interface ApiLogContext {
  route?: string
  method?: string
  path?: string
  status?: number
  durationMs?: number
  error?: unknown
  correlationId?: string
  traceId?: string
  [key: string]: unknown
}

export interface ApiRouteLogger {
  json(body: unknown, init?: ResponseInit, details?: ApiLogContext): Promise<NextResponse>
  report(level: ApiLogLevel, error: unknown, body: unknown, init?: ResponseInit, details?: ApiLogContext): Promise<NextResponse>
}

const globalState = globalThis as typeof globalThis & {
  __openStellarLogtail__?: Logtail | null
}

function getLogger(): Logtail | null {
  const token = process.env.LOGTAIL_SOURCE_TOKEN?.trim()
  if (!token) return null

  if (globalState.__openStellarLogtail__ === undefined) {
    globalState.__openStellarLogtail__ = new Logtail(token)
  }

  return globalState.__openStellarLogtail__
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 497)}...`
  }

  return value
}

function normalizeKeyedValue(key: string, value: unknown): unknown {
  if (/(authorization|cookie|password|secret|token|api[_-]?key|signedxdr)/i.test(key)) {
    return '[redacted]'
  }

  return normalizeValue(value)
}

function normalizeContext(context: ApiLogContext): ApiLogContext {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, normalizeKeyedValue(key, value)]),
  )
}

function levelForStatus(status: number): ApiLogLevel {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return 'info'
}

function routeContext(
  req: Request,
  route: string,
  startedAt: number,
  details?: ApiLogContext,
): ApiLogContext {
  const url = new URL(req.url)
  const query = Object.fromEntries(
    Array.from(url.searchParams.entries(), ([key, value]) => [key, normalizeKeyedValue(key, value)]),
  )

  // Extract or create trace context
  const traceContext = extractTraceContext(req.headers)
  if (traceContext) {
    setTraceContext(traceContext)
  }

  return normalizeContext({
    route,
    method: req.method,
    path: url.pathname,
    query,
    durationMs: Date.now() - startedAt,
    correlationId: getCorrelationId(),
    traceId: traceContext?.traceId,
    ...details,
  })
}

async function emit(level: ApiLogLevel, message: string, context: ApiLogContext) {
  const logger = getLogger()
  if (!logger) return

  try {
    await logger[level](message, context)
  } catch {
    // Logging must never break the request path.
  }
}

export function clearLogtailLoggerForTests() {
  globalState.__openStellarLogtail__ = undefined
}

export async function logApiEvent(level: ApiLogLevel, message: string, context: ApiLogContext = {}) {
  await emit(level, message, normalizeContext(context))
}

export function createApiRouteLogger(req: Request, route: string, baseDetails: ApiLogContext = {}): ApiRouteLogger {
  const startedAt = Date.now()

  return {
    async json(body: unknown, init?: ResponseInit, details: ApiLogContext = {}) {
      const response = NextResponse.json(body, init)
      const context = routeContext(req, route, startedAt, {
        ...baseDetails,
        ...details,
        status: response.status,
      })
      await emit(levelForStatus(response.status), 'api.route.completed', context)
      return response
    },

    async report(level: ApiLogLevel, error: unknown, body: unknown, init?: ResponseInit, details: ApiLogContext = {}) {
      const response = NextResponse.json(body, init)
      const context = routeContext(req, route, startedAt, {
        ...baseDetails,
        ...details,
        status: response.status,
        error,
      })
      await emit(level, 'api.route.failed', context)
      return response
    },
  }
}
