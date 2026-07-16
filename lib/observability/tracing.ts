/**
 * Distributed tracing system for agent activity
 * Implements OpenTelemetry-compatible tracing with correlation IDs
 */

export interface TraceContext {
  traceId: string
  spanId: string
  parentSpanId?: string
  sampled: boolean
}

export interface Span {
  name: string
  traceId: string
  spanId: string
  parentSpanId?: string
  startTime: number
  endTime?: number
  durationMs?: number
  status: 'ok' | 'error'
  attributes: Record<string, unknown>
  events: TraceEvent[]
}

export interface TraceEvent {
  name: string
  timestamp: number
  attributes: Record<string, unknown>
}

const globalState = globalThis as typeof globalThis & {
  __openStellarTraceContext__?: TraceContext
  __openStellarSpans__?: Map<string, Span>
}

function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Get or create current trace context
 */
export function getTraceContext(): TraceContext {
  if (!globalState.__openStellarTraceContext__) {
    globalState.__openStellarTraceContext__ = {
      traceId: generateId(),
      spanId: generateId(),
      sampled: Math.random() < 0.1, // 10% sample rate
    }
  }
  return globalState.__openStellarTraceContext__
}

/**
 * Set trace context (for incoming requests)
 */
export function setTraceContext(context: TraceContext): void {
  globalState.__openStellarTraceContext__ = context
}

/**
 * Clear trace context (for test cleanup)
 */
export function clearTraceContext(): void {
  globalState.__openStellarTraceContext__ = undefined
  globalState.__openStellarSpans__?.clear()
}

/**
 * Get span storage
 */
function getSpans(): Map<string, Span> {
  if (!globalState.__openStellarSpans__) {
    globalState.__openStellarSpans__ = new Map()
  }
  return globalState.__openStellarSpans__
}

/**
 * Create a new span
 */
export function createSpan(name: string, attributes: Record<string, unknown> = {}): Span {
  const traceContext = getTraceContext()
  const spanId = generateId()
  
  const span: Span = {
    name,
    traceId: traceContext.traceId,
    spanId,
    parentSpanId: traceContext.spanId,
    startTime: Date.now(),
    status: 'ok',
    attributes,
    events: [],
  }
  
  getSpans().set(spanId, span)
  
  // Update current span ID
  traceContext.spanId = spanId
  
  return span
}

/**
 * Finish a span
 */
export function finishSpan(span: Span, status: 'ok' | 'error' = 'ok'): void {
  span.endTime = Date.now()
  span.durationMs = span.endTime - span.startTime
  span.status = status
  
  // Restore parent span ID
  const traceContext = getTraceContext()
  if (span.parentSpanId) {
    traceContext.spanId = span.parentSpanId
  }
}

/**
 * Add event to span
 */
export function addSpanEvent(span: Span, name: string, attributes: Record<string, unknown> = {}): void {
  span.events.push({
    name,
    timestamp: Date.now(),
    attributes,
  })
}

/**
 * Get all spans for current trace
 */
export function getCurrentTraceSpans(): Span[] {
  const traceContext = getTraceContext()
  const spans = getSpans()
  
  return Array.from(spans.values()).filter(
    span => span.traceId === traceContext.traceId
  )
}

/**
 * Run function within a span
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T> | T,
  attributes: Record<string, unknown> = {}
): Promise<T> {
  const span = createSpan(name, attributes)
  
  try {
    const result = await fn()
    finishSpan(span, 'ok')
    return result
  } catch (error) {
    finishSpan(span, 'error')
    addSpanEvent(span, 'error', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
      } : String(error),
    })
    throw error
  }
}

/**
 * Extract trace context from headers
 */
export function extractTraceContext(headers: Headers): TraceContext | null {
  const traceParent = headers.get('traceparent')
  if (!traceParent) return null
  
  // Format: 00-{traceId}-{spanId}-{traceFlags}
  const parts = traceParent.split('-')
  if (parts.length !== 4) return null
  
  const [, traceId, spanId, traceFlags] = parts
  
  return {
    traceId,
    spanId,
    sampled: traceFlags[0] === '1',
  }
}

/**
 * Inject trace context into headers
 */
export function injectTraceContext(headers: Headers, context?: TraceContext): void {
  const ctx = context || getTraceContext()
  const traceFlags = ctx.sampled ? '1' : '0'
  
  headers.set('traceparent', `00-${ctx.traceId}-${ctx.spanId}-${traceFlags}`)
}

/**
 * Get correlation ID for logging
 */
export function getCorrelationId(): string {
  return getTraceContext().traceId
}
