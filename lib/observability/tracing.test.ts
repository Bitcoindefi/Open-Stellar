import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  getTraceContext,
  setTraceContext,
  clearTraceContext,
  createSpan,
  finishSpan,
  addSpanEvent,
  getCurrentTraceSpans,
  withSpan,
  extractTraceContext,
  injectTraceContext,
  getCorrelationId,
} from './tracing'

describe('Distributed Tracing', () => {
  beforeEach(() => {
    clearTraceContext()
  })

  afterEach(() => {
    clearTraceContext()
  })

  describe('Trace Context', () => {
    it('should create new trace context', () => {
      const context = getTraceContext()

      expect(context).toBeDefined()
      expect(context.traceId).toMatch(/^[0-9a-f-]{36}$/)
      expect(context.spanId).toMatch(/^[0-9a-f-]{36}$/)
      expect(context.sampled).toBeDefined()
      expect(typeof context.sampled).toBe('boolean')
    })

    it('should set custom trace context', () => {
      const customContext = {
        traceId: 'custom-trace-id',
        spanId: 'custom-span-id',
        sampled: true,
      }

      setTraceContext(customContext)
      const context = getTraceContext()

      expect(context.traceId).toBe('custom-trace-id')
      expect(context.spanId).toBe('custom-span-id')
      expect(context.sampled).toBe(true)
    })

    it('should clear trace context', () => {
      getTraceContext()
      clearTraceContext()

      const newContext = getTraceContext()
      expect(newContext.traceId).not.toBe(getTraceContext().traceId)
    })

    it('should return correlation ID', () => {
      const context = getTraceContext()
      const correlationId = getCorrelationId()

      expect(correlationId).toBe(context.traceId)
    })
  })

  describe('Span Management', () => {
    it('should create a span', () => {
      const span = createSpan('test-operation', { key: 'value' })

      expect(span).toBeDefined()
      expect(span.name).toBe('test-operation')
      expect(span.traceId).toBe(getTraceContext().traceId)
      expect(span.spanId).toBeDefined()
      expect(span.parentSpanId).toBeDefined()
      expect(span.startTime).toBeDefined()
      expect(span.status).toBe('ok')
      expect(span.attributes).toEqual({ key: 'value' })
      expect(span.events).toEqual([])
    })

    it('should finish a span', () => {
      const span = createSpan('test-operation')
      finishSpan(span, 'ok')

      expect(span.endTime).toBeDefined()
      expect(span.durationMs).toBeDefined()
      expect(span.durationMs).toBeGreaterThan(0)
      expect(span.status).toBe('ok')
    })

    it('should finish span with error status', () => {
      const span = createSpan('test-operation')
      finishSpan(span, 'error')

      expect(span.status).toBe('error')
    })

    it('should add event to span', () => {
      const span = createSpan('test-operation')
      addSpanEvent(span, 'test-event', { data: 'test' })

      expect(span.events).toHaveLength(1)
      expect(span.events[0].name).toBe('test-event')
      expect(span.events[0].attributes).toEqual({ data: 'test' })
      expect(span.events[0].timestamp).toBeDefined()
    })

    it('should get current trace spans', () => {
      const span1 = createSpan('operation-1')
      const span2 = createSpan('operation-2')

      const spans = getCurrentTraceSpans()

      expect(spans).toHaveLength(2)
      expect(spans.map(s => s.name)).toEqual(['operation-1', 'operation-2'])
    })

    it('should only return spans for current trace', () => {
      const span1 = createSpan('operation-1')
      
      // Create new trace context
      clearTraceContext()
      setTraceContext({ traceId: 'different-trace', spanId: 'span-1', sampled: true })
      
      const span2 = createSpan('operation-2')

      const spans = getCurrentTraceSpans()
      expect(spans).toHaveLength(1)
      expect(spans[0].traceId).toBe('different-trace')
    })
  })

  describe('withSpan Helper', () => {
    it('should run function within span', async () => {
      const result = await withSpan('test-operation', async () => {
        return 'success'
      })

      expect(result).toBe('success')
      const spans = getCurrentTraceSpans()
      expect(spans).toHaveLength(1)
      expect(spans[0].status).toBe('ok')
    })

    it('should finish span with error on exception', async () => {
      await expect(
        withSpan('test-operation', () => {
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')

      const spans = getCurrentTraceSpans()
      expect(spans).toHaveLength(1)
      expect(spans[0].status).toBe('error')
      expect(spans[0].events).toHaveLength(1)
      expect(spans[0].events[0].name).toBe('error')
    })

    it('should include error details in span event', async () => {
      await expect(
        withSpan('test-operation', () => {
          throw new Error('test error')
        })
      ).rejects.toThrow()

      const spans = getCurrentTraceSpans()
      const errorEvent = spans[0].events[0]
      expect(errorEvent.attributes.error).toEqual({
        name: 'Error',
        message: 'test error',
      })
    })

    it('should include custom attributes', async () => {
      await withSpan('test-operation', () => {}, { custom: 'attribute' })

      const spans = getCurrentTraceSpans()
      expect(spans[0].attributes).toEqual({ custom: 'attribute' })
    })
  })

  describe('Trace Context Propagation', () => {
    it('should extract trace context from headers', () => {
      const headers = new Headers()
      headers.set('traceparent', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')

      const context = extractTraceContext(headers)

      expect(context).toEqual({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        sampled: true,
      })
    })

    it('should return null for invalid traceparent format', () => {
      const headers = new Headers()
      headers.set('traceparent', 'invalid-format')

      const context = extractTraceContext(headers)
      expect(context).toBeNull()
    })

    it('should return null when traceparent header missing', () => {
      const headers = new Headers()
      const context = extractTraceContext(headers)
      expect(context).toBeNull()
    })

    it('should inject trace context into headers', () => {
      const context = {
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
        sampled: true,
      }

      const headers = new Headers()
      injectTraceContext(headers, context)

      expect(headers.get('traceparent')).toBe('00-test-trace-id-test-span-id-1')
    })

    it('should inject current trace context when none provided', () => {
      getTraceContext()
      const headers = new Headers()
      injectTraceContext(headers)

      expect(headers.get('traceparent')).toMatch(/^00-[0-9a-f-]{36}-[0-9a-f-]{36}-[01]$/)
    })

    it('should handle unsampled traces', () => {
      const context = {
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
        sampled: false,
      }

      const headers = new Headers()
      injectTraceContext(headers, context)

      expect(headers.get('traceparent')).toBe('00-test-trace-id-test-span-id-0')
    })
  })

  describe('Span Hierarchy', () => {
    it('should create parent-child span relationship', () => {
      const parentSpan = createSpan('parent-operation')
      const parentSpanId = parentSpan.spanId

      const childSpan = createSpan('child-operation')

      expect(childSpan.parentSpanId).toBe(parentSpanId)
    })

    it('should restore parent span ID after finishing child', () => {
      const parentSpan = createSpan('parent-operation')
      const parentSpanId = parentSpan.spanId

      const childSpan = createSpan('child-operation')
      finishSpan(childSpan)

      const currentContext = getTraceContext()
      expect(currentContext.spanId).toBe(parentSpanId)
    })
  })
})
