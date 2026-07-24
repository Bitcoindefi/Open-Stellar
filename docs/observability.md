# Observability: Structured Logging, Metrics, and Distributed Tracing

This document describes the observability system for agent activity in Open Stellar, including structured logging with correlation IDs, metrics collection, and distributed tracing.

## Overview

The observability system provides three pillars of observability:

1. **Structured Logging** - Enhanced API logging with correlation IDs and trace context
2. **Metrics Collection** - Counter, gauge, and histogram metrics for agent activity
3. **Distributed Tracing** - OpenTelemetry-compatible tracing for request flows

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Request                             │
│                        │                                    │
│                        ▼                                    │
│              Extract/Create Trace Context                   │
│                        │                                    │
│                        ▼                                    │
│              Create Span (operation)                        │
│                        │                                    │
│                        ▼                                    │
│              Execute Business Logic                         │
│                        │                                    │
│                        ├─► Add Span Events                 │
│                        ├─► Record Metrics                  │
│                        └─► Log with Correlation ID         │
│                        │                                    │
│                        ▼                                    │
│              Finish Span (ok/error)                         │
│                        │                                    │
│                        ▼                                    │
│              Response with Trace Headers                     │
└─────────────────────────────────────────────────────────────┘
```

## Structured Logging

### Enhanced API Logging

The existing `lib/api-logging.ts` has been enhanced to include correlation IDs and trace context in all log entries.

**Usage:**

```typescript
import { createApiRouteLogger } from '@/lib/api-logging'

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, '/api/endpoint')
  
  return await api.json({ ok: true, data: '...' }, undefined, {
    event: 'custom.event',
    customField: 'value',
  })
}
```

**Log Context includes:**
- `correlationId` - Unique ID for the entire request trace
- `traceId` - Distributed trace ID
- `route` - API route path
- `method` - HTTP method
- `path` - Request path
- `status` - Response status
- `durationMs` - Request duration
- Custom fields from `details` parameter

### Manual Event Logging

```typescript
import { logApiEvent } from '@/lib/api-logging'

await logApiEvent('info', 'custom.event', {
  agentId: 'agent-123',
  action: 'completed',
  duration: 150,
})
```

## Distributed Tracing

### Trace Context

Traces are automatically created for each request and propagated via the `traceparent` header.

**Trace Context Structure:**
```typescript
interface TraceContext {
  traceId: string    // Unique trace identifier
  spanId: string     // Current span identifier
  parentSpanId?: string  // Parent span for hierarchy
  sampled: boolean   // Whether this trace is sampled (10% default)
}
```

### Creating Spans

```typescript
import { createSpan, finishSpan, addSpanEvent } from '@/lib/observability/tracing'

// Create a span
const span = createSpan('operation.name', {
  agentId: 'agent-123',
  action: 'process',
})

// Add events during operation
addSpanEvent(span, 'step.completed', { step: 'validation' })
addSpanEvent(span, 'step.completed', { step: 'processing' })

// Finish span
finishSpan(span, 'ok') // or 'error'
```

### Using withSpan Helper

```typescript
import { withSpan } from '@/lib/observability/tracing'

const result = await withSpan('operation.name', async () => {
  // Your operation here
  return 'success'
}, { customAttribute: 'value' })
```

### Trace Context Propagation

**Extract from incoming request:**
```typescript
import { extractTraceContext, setTraceContext } from '@/lib/observability/tracing'

const traceContext = extractTraceContext(req.headers)
if (traceContext) {
  setTraceContext(traceContext)
}
```

**Inject into outgoing request:**
```typescript
import { injectTraceContext } from '@/lib/observability/tracing'

const headers = new Headers()
injectTraceContext(headers)

// Headers now include: traceparent: 00-{traceId}-{spanId}-{sampled}
```

### Getting Correlation ID

```typescript
import { getCorrelationId } from '@/lib/observability/tracing'

const correlationId = getCorrelationId()
console.log(`Request correlation ID: ${correlationId}`)
```

## Metrics Collection

### Metric Types

**Counter** - Monotonically increasing value
```typescript
import { incrementCounter, AgentMetrics } from '@/lib/observability/metrics'

incrementCounter(AgentMetrics.X402_PAYMENTS_SETTLED, 1, {
  chain: 'stellar',
  mode: 'production',
})
```

**Gauge** - Point-in-time value
```typescript
import { setGauge } from '@/lib/observability/metrics'

setGauge(AgentMetrics.AGENT_TASKS_ACTIVE, 5, {
  agentId: 'agent-123',
})
```

**Histogram** - Distribution of values
```typescript
import { recordHistogram, AgentMetrics } from '@/lib/observability/metrics'

recordHistogram(AgentMetrics.X402_SETTLEMENT_DURATION, 150, {
  chain: 'stellar',
})
```

### Predefined Metrics

```typescript
import { AgentMetrics } from '@/lib/observability/metrics'

// Agent lifecycle
AgentMetrics.AGENT_START
AgentMetrics.AGENT_STOP
AgentMetrics.AGENT_TASKS_TOTAL
AgentMetrics.AGENT_TASKS_ACTIVE

// x402 payments
AgentMetrics.X402_QUOTES_CREATED
AgentMetrics.X402_PAYMENTS_SETTLED
AgentMetrics.X402_PAYMENTS_FAILED
AgentMetrics.X402_PAYMENT_AMOUNT
AgentMetrics.X402_SETTLEMENT_DURATION

// Passport operations
AgentMetrics.PASSPORT_MINT
AgentMetrics.PASSPORT_VERIFY
AgentMetrics.PASSPORT_AUTHORIZE
AgentMetrics.PASSPORT_AUTHORIZE_DENIED
AgentMetrics.PASSPORT_VERIFICATION_DURATION

// API routes
AgentMetrics.API_REQUESTS_TOTAL
AgentMetrics.API_REQUEST_DURATION
AgentMetrics.API_ERRORS_TOTAL

// System
AgentMetrics.SYSTEM_MEMORY_USAGE
AgentMetrics.SYSTEM_CPU_USAGE
```

### Using Timers

```typescript
import { Timer, AgentMetrics } from '@/lib/observability/metrics'

// Manual timing
const timer = new Timer(AgentMetrics.X402_SETTLEMENT_DURATION, { chain: 'stellar' })
// ... perform operation ...
timer.stop()

// Automatic timing
const result = await Timer.time(AgentMetrics.X402_SETTLEMENT_DURATION, async () => {
  // ... perform operation ...
  return result
}, { chain: 'stellar' })
```

### Querying Metrics

```typescript
import { getAllMetrics, getMetricsByName, getLatestMetric } from '@/lib/observability/metrics'

// Get all metrics
const allMetrics = getAllMetrics()

// Get metrics by name
const x402Metrics = getMetricsByName('x402_payments_settled_total')

// Get latest value for specific metric
const latest = getLatestMetric('x402_payments_settled_total', { chain: 'stellar' })
```

### Prometheus Format

```typescript
import { formatPrometheusMetrics } from '@/lib/observability/metrics'

const prometheusFormat = formatPrometheusMetrics()
console.log(prometheusFormat)
```

Output:
```
# HELP x402_payments_settled_total Total number of x402 payments settled
# TYPE x402_payments_settled_total counter
x402_payments_settled_total{chain="stellar",mode="production"} 42

# HELP x402_settlement_duration_ms Duration of x402 payment settlement
# TYPE x402_settlement_duration_ms histogram
x402_settlement_duration_ms_sum{chain="stellar"} 1250
x402_settlement_duration_ms_count{chain="stellar"} 10
x402_settlement_duration_ms_bucket{chain="stellar",le="0.005"} 0
x402_settlement_duration_ms_bucket{chain="stellar",le="0.01"} 0
...
```

## Instrumentation Examples

### x402 Payment Flow

The x402 settlement route includes comprehensive instrumentation:

```typescript
import { createSpan, addSpanEvent, finishSpan } from '@/lib/observability/tracing'
import { incrementCounter, recordHistogram, Timer, AgentMetrics } from '@/lib/observability/metrics'

export const POST = withApiKeyAuth(async (req: Request) => {
  const timer = new Timer(AgentMetrics.X402_SETTLEMENT_DURATION, { chain: 'unknown' })
  const settlementSpan = createSpan('x402.settlement', { path: '/api/protocol/x402/settle' })

  try {
    // ... business logic ...

    addSpanEvent(settlementSpan, 'passport_gate_check', { agentId, amountUnits })
    const gate = await authorizePayment(agentId, quote.amountUnits)
    addSpanEvent(settlementSpan, 'passport_gate_result', { authorized: gate.authorized })

    if (!gate.authorized) {
      finishSpan(settlementSpan, 'error')
      incrementCounter(AgentMetrics.X402_PAYMENTS_FAILED, 1, { reason: 'passport_denied', chain })
      timer.stop()
      return error response
    }

    // ... settlement logic ...

    finishSpan(settlementSpan, 'ok')
    incrementCounter(AgentMetrics.X402_PAYMENTS_SETTLED, 1, { chain })
    recordHistogram(AgentMetrics.X402_PAYMENT_AMOUNT, receipt.amountUsd, { chain })
    timer.stop()

    return success response
  } catch (error) {
    finishSpan(settlementSpan, 'error')
    incrementCounter(AgentMetrics.X402_PAYMENTS_FAILED, 1, { reason: 'exception', chain })
    timer.stop()
    throw error
  }
}, { keyType: 'protocol' })
```

### Passport Authorization

```typescript
import { createSpan, addSpanEvent, finishSpan } from '@/lib/observability/tracing'
import { incrementCounter, Timer, AgentMetrics } from '@/lib/observability/metrics'

export const POST = withApiKeyAuth(async (req: Request) => {
  const timer = new Timer(AgentMetrics.PASSPORT_VERIFICATION_DURATION)
  const authSpan = createSpan('passport.authorize')

  try {
    const result = await authorizePayment(agentId, amount)
    
    addSpanEvent(authSpan, 'authorization_result', { 
      authorized: result.authorized, 
      reason: result.reason 
    })

    if (result.authorized) {
      incrementCounter(AgentMetrics.PASSPORT_AUTHORIZE, 1, { status: 'authorized' })
    } else {
      incrementCounter(AgentMetrics.PASSPORT_AUTHORIZE_DENIED, 1, { reason: result.reason })
    }

    finishSpan(authSpan, 'ok')
    timer.stop()
    return response
  } catch (error) {
    finishSpan(authSpan, 'error')
    incrementCounter(AgentMetrics.PASSPORT_AUTHORIZE_DENIED, 1, { reason: 'exception' })
    timer.stop()
    throw error
  }
}, { keyType: 'protocol' })
```

## Environment Configuration

### Logtail Integration

Set the `LOGTAIL_SOURCE_TOKEN` environment variable to enable structured logging:

```bash
LOGTAIL_SOURCE_TOKEN=your_logtail_source_token
```

### Sampling Rate

The default trace sampling rate is 10%. This can be adjusted in `lib/observability/tracing.ts`:

```typescript
sampled: Math.random() < 0.1, // 10% sample rate
```

## Testing

### Running Observability Tests

```bash
# Run all observability tests
npm test lib/observability/

# Run specific test file
npm test lib/observability/tracing.test.ts
npm test lib/observability/metrics.test.ts
```

### Test Utilities

```typescript
import { clearTraceContext } from '@/lib/observability/tracing'
import { clearMetrics } from '@/lib/observability/metrics'

beforeEach(() => {
  clearTraceContext()
  clearMetrics()
})
```

## Best Practices

### 1. Always Create Spans for Operations

```typescript
// Good
const span = createSpan('operation.name')
// ... logic ...
finishSpan(span, 'ok')

// Bad
// No span created
```

### 2. Add Meaningful Events

```typescript
// Good
addSpanEvent(span, 'validation_passed', { agentId, amount })
addSpanEvent(span, 'payment_verified', { txHash })

// Bad
addSpanEvent(span, 'step1')
addSpanEvent(span, 'step2')
```

### 3. Use Appropriate Metric Types

```typescript
// Counter for cumulative counts
incrementCounter(AgentMetrics.X402_PAYMENTS_SETTLED, 1)

// Gauge for current state
setGauge(AgentMetrics.AGENT_TASKS_ACTIVE, currentActiveTasks)

// Histogram for distributions
recordHistogram(AgentMetrics.X402_SETTLEMENT_DURATION, duration)
```

### 4. Include Relevant Labels

```typescript
// Good
incrementCounter(AgentMetrics.X402_PAYMENTS_SETTLED, 1, {
  chain: 'stellar',
  mode: 'production',
  agentTier: 'premium',
})

// Bad
incrementCounter(AgentMetrics.X402_PAYMENTS_SETTLED, 1)
```

### 5. Handle Errors in Spans

```typescript
try {
  // ... logic ...
  finishSpan(span, 'ok')
} catch (error) {
  addSpanEvent(span, 'error', { error: error.message })
  finishSpan(span, 'error')
  throw error
}
```

## Troubleshooting

### Missing Correlation IDs

If correlation IDs are missing from logs:
1. Ensure `extractTraceContext` is called early in the request
2. Check that `getTraceContext` creates a new context if none exists
3. Verify the logging middleware is properly configured

### Metrics Not Recording

If metrics are not appearing:
1. Check that the metric name matches `AgentMetrics` constants
2. Verify labels are consistent across calls
3. Use `getAllMetrics()` to debug what's being recorded

### Spans Not Appearing

If spans are missing:
1. Ensure `finishSpan` is called for every created span
2. Check that the trace is being sampled (10% default)
3. Verify span events are added before finishing

## Integration with External Systems

### Prometheus

The `formatPrometheusMetrics()` function outputs Prometheus-compatible format. Create an endpoint to expose metrics:

```typescript
// app/api/metrics/route.ts
import { formatPrometheusMetrics } from '@/lib/observability/metrics'

export async function GET() {
  return new Response(formatPrometheusMetrics(), {
    headers: { 'Content-Type': 'text/plain' },
  })
}
```

### OpenTelemetry

The tracing system is compatible with OpenTelemetry's `traceparent` header format. It can be integrated with OpenTelemetry collectors for distributed tracing visualization.

### Logtail

Structured logs are automatically sent to Logtail when `LOGTAIL_SOURCE_TOKEN` is configured. Logs include correlation IDs and trace context for filtering and searching.
