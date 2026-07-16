/**
 * Metrics collection system for agent activity
 * Implements counter, gauge, and histogram metrics with aggregation
 */

export type MetricType = 'counter' | 'gauge' | 'histogram'

export interface Metric {
  name: string
  type: MetricType
  help: string
  labels: Record<string, string>
  value: number
  timestamp: number
}

export interface HistogramBucket {
  le: number
  count: number
}

export interface HistogramMetric extends Metric {
  type: 'histogram'
  sum: number
  count: number
  buckets: HistogramBucket[]
}

const globalState = globalThis as typeof globalThis & {
  __openStellarMetrics__?: Map<string, Metric[]>
}

function getMetricsStore(): Map<string, Metric[]> {
  if (!globalState.__openStellarMetrics__) {
    globalState.__openStellarMetrics__ = new Map()
  }
  return globalState.__openStellarMetrics__
}

/**
 * Clear all metrics (for test cleanup)
 */
export function clearMetrics(): void {
  globalState.__openStellarMetrics__?.clear()
}

/**
 * Increment a counter metric
 */
export function incrementCounter(
  name: string,
  value: number = 1,
  labels: Record<string, string> = {},
  help: string = ''
): void {
  const store = getMetricsStore()
  const key = metricKey(name, labels)
  
  const existing = store.get(key) || []
  const last = existing[existing.length - 1]
  
  const metric: Metric = {
    name,
    type: 'counter',
    help,
    labels,
    value: (last?.value || 0) + value,
    timestamp: Date.now(),
  }
  
  store.set(key, [...existing, metric])
}

/**
 * Set a gauge metric
 */
export function setGauge(
  name: string,
  value: number,
  labels: Record<string, string> = {},
  help: string = ''
): void {
  const store = getMetricsStore()
  const key = metricKey(name, labels)
  
  const metric: Metric = {
    name,
    type: 'gauge',
    help,
    labels,
    value,
    timestamp: Date.now(),
  }
  
  store.set(key, [metric])
}

/**
 * Record a histogram observation
 */
export function recordHistogram(
  name: string,
  value: number,
  labels: Record<string, string> = {},
  help: string = '',
  buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
): void {
  const store = getMetricsStore()
  const key = metricKey(name, labels)
  
  const existing = store.get(key) || []
  const last = existing[existing.length - 1] as HistogramMetric | undefined
  
  const histogramBuckets = buckets.map(le => ({
    le,
    count: (last?.buckets.find(b => b.le === le)?.count || 0) + (value <= le ? 1 : 0),
  }))
  
  const metric: HistogramMetric = {
    name,
    type: 'histogram',
    help,
    labels,
    value,
    sum: (last?.sum || 0) + value,
    count: (last?.count || 0) + 1,
    buckets: histogramBuckets,
    timestamp: Date.now(),
  }
  
  store.set(key, [...existing, metric])
}

/**
 * Get all metrics
 */
export function getAllMetrics(): Metric[] {
  const store = getMetricsStore()
  const allMetrics: Metric[] = []
  
  for (const metrics of store.values()) {
    allMetrics.push(...metrics)
  }
  
  return allMetrics
}

/**
 * Get metrics by name
 */
export function getMetricsByName(name: string): Metric[] {
  const store = getMetricsStore()
  const metrics: Metric[] = []
  
  for (const [key, metricList] of store.entries()) {
    if (key.startsWith(`${name}:`)) {
      metrics.push(...metricList)
    }
  }
  
  return metrics
}

/**
 * Get latest value for a metric
 */
export function getLatestMetric(name: string, labels: Record<string, string> = {}): Metric | undefined {
  const store = getMetricsStore()
  const key = metricKey(name, labels)
  const metrics = store.get(key)
  
  return metrics?.[metrics.length - 1]
}

/**
 * Format metrics in Prometheus format
 */
export function formatPrometheusMetrics(): string {
  const store = getMetricsStore()
  const lines: string[] = []
  
  for (const [key, metrics] of store.entries()) {
    const latest = metrics[metrics.length - 1]
    
    // Help line
    lines.push(`# HELP ${latest.name} ${latest.help || 'No help text'}`)
    lines.push(`# TYPE ${latest.name} ${latest.type}`)
    
    // Metric line
    const labelString = Object.entries(latest.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')
    
    if (latest.type === 'histogram') {
      const hist = latest as HistogramMetric
      lines.push(`${latest.name}_sum{${labelString}} ${hist.sum}`)
      lines.push(`${latest.name}_count{${labelString}} ${hist.count}`)
      
      for (const bucket of hist.buckets) {
        lines.push(
          `${latest.name}_bucket{${labelString},le="${bucket.le}"} ${bucket.count}`
        )
      }
      lines.push(`${latest.name}_bucket{${labelString},le="+Inf"} ${hist.count}`)
    } else {
      lines.push(`${latest.name}{${labelString}} ${latest.value}`)
    }
  }
  
  return lines.join('\n')
}

/**
 * Generate metric key from name and labels
 */
function metricKey(name: string, labels: Record<string, string>): string {
  const labelString = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
  
  return `${name}:${labelString}`
}

/**
 * Timer for measuring duration
 */
export class Timer {
  private startTime: number
  private name: string
  private labels: Record<string, string>
  private help: string
  
  constructor(name: string, labels: Record<string, string> = {}, help: string = '') {
    this.name = name
    this.labels = labels
    this.help = help
    this.startTime = Date.now()
  }
  
  stop(): number {
    const duration = Date.now() - this.startTime
    recordHistogram(this.name, duration, this.labels, this.help)
    return duration
  }
  
  /**
   * Create a timer and run a function
   */
  static async time<T>(
    name: string,
    fn: () => Promise<T> | T,
    labels: Record<string, string> = {},
    help: string = ''
  ): Promise<T> {
    const timer = new Timer(name, labels, help)
    try {
      const result = await fn()
      timer.stop()
      return result
    } catch (error) {
      timer.stop()
      throw error
    }
  }
}

/**
 * Predefined metric names for agent activity
 */
export const AgentMetrics = {
  // Agent lifecycle
  AGENT_START: 'agent_start_total',
  AGENT_STOP: 'agent_stop_total',
  AGENT_TASKS_TOTAL: 'agent_tasks_total',
  AGENT_TASKS_ACTIVE: 'agent_tasks_active',
  
  // x402 payments
  X402_QUOTES_CREATED: 'x402_quotes_created_total',
  X402_PAYMENTS_SETTLED: 'x402_payments_settled_total',
  X402_PAYMENTS_FAILED: 'x402_payments_failed_total',
  X402_PAYMENT_AMOUNT: 'x402_payment_amount_usd',
  X402_SETTLEMENT_DURATION: 'x402_settlement_duration_ms',
  
  // Passport operations
  PASSPORT_MINT: 'passport_mint_total',
  PASSPORT_VERIFY: 'passport_verify_total',
  PASSPORT_AUTHORIZE: 'passport_authorize_total',
  PASSPORT_AUTHORIZE_DENIED: 'passport_authorize_denied_total',
  PASSPORT_VERIFICATION_DURATION: 'passport_verification_duration_ms',
  
  // API routes
  API_REQUESTS_TOTAL: 'api_requests_total',
  API_REQUEST_DURATION: 'api_request_duration_ms',
  API_ERRORS_TOTAL: 'api_errors_total',
  
  // System
  SYSTEM_MEMORY_USAGE: 'system_memory_usage_bytes',
  SYSTEM_CPU_USAGE: 'system_cpu_usage_percent',
} as const
