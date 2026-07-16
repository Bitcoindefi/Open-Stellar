import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  incrementCounter,
  setGauge,
  recordHistogram,
  getAllMetrics,
  getMetricsByName,
  getLatestMetric,
  formatPrometheusMetrics,
  clearMetrics,
  Timer,
  AgentMetrics,
} from './metrics'

describe('Metrics Collection', () => {
  beforeEach(() => {
    clearMetrics()
  })

  afterEach(() => {
    clearMetrics()
  })

  describe('Counter Metrics', () => {
    it('should increment counter', () => {
      incrementCounter('test_counter', 1, { label: 'test' }, 'Test counter')

      const metrics = getAllMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('test_counter')
      expect(metrics[0].type).toBe('counter')
      expect(metrics[0].value).toBe(1)
      expect(metrics[0].labels).toEqual({ label: 'test' })
    })

    it('should increment counter multiple times', () => {
      incrementCounter('test_counter', 1, { label: 'test' })
      incrementCounter('test_counter', 2, { label: 'test' })

      const metrics = getMetricsByName('test_counter')
      expect(metrics).toHaveLength(2)
      expect(metrics[1].value).toBe(3) // 1 + 2
    })

    it('should handle different label combinations separately', () => {
      incrementCounter('test_counter', 1, { label: 'a' })
      incrementCounter('test_counter', 1, { label: 'b' })

      const metrics = getMetricsByName('test_counter')
      expect(metrics).toHaveLength(2)
    })

    it('should use default increment value', () => {
      incrementCounter('test_counter')

      const metrics = getAllMetrics()
      expect(metrics[0].value).toBe(1)
    })
  })

  describe('Gauge Metrics', () => {
    it('should set gauge value', () => {
      setGauge('test_gauge', 42, { label: 'test' }, 'Test gauge')

      const metrics = getAllMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('test_gauge')
      expect(metrics[0].type).toBe('gauge')
      expect(metrics[0].value).toBe(42)
    })

    it('should overwrite previous gauge value', () => {
      setGauge('test_gauge', 10, { label: 'test' })
      setGauge('test_gauge', 20, { label: 'test' })

      const metrics = getMetricsByName('test_gauge')
      expect(metrics).toHaveLength(1)
      expect(metrics[0].value).toBe(20)
    })

    it('should handle different label combinations separately', () => {
      setGauge('test_gauge', 10, { label: 'a' })
      setGauge('test_gauge', 20, { label: 'b' })

      const metrics = getMetricsByName('test_gauge')
      expect(metrics).toHaveLength(2)
    })
  })

  describe('Histogram Metrics', () => {
    it('should record histogram observation', () => {
      recordHistogram('test_histogram', 0.5, { label: 'test' }, 'Test histogram')

      const metrics = getAllMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('test_histogram')
      expect(metrics[0].type).toBe('histogram')
      expect((metrics[0] as any).sum).toBe(0.5)
      expect((metrics[0] as any).count).toBe(1)
    })

    it('should accumulate histogram observations', () => {
      recordHistogram('test_histogram', 0.5, { label: 'test' })
      recordHistogram('test_histogram', 1.5, { label: 'test' })

      const metrics = getMetricsByName('test_histogram')
      const latest = metrics[metrics.length - 1] as any
      expect(latest.sum).toBe(2.0)
      expect(latest.count).toBe(2)
    })

    it('should populate histogram buckets correctly', () => {
      recordHistogram('test_histogram', 0.05, { label: 'test' })

      const metrics = getAllMetrics()
      const histogram = metrics[0] as any
      expect(histogram.buckets).toBeDefined()
      expect(histogram.buckets.length).toBeGreaterThan(0)
    })

    it('should use default buckets', () => {
      recordHistogram('test_histogram', 0.5, { label: 'test' })

      const metrics = getAllMetrics()
      const histogram = metrics[0] as any
      expect(histogram.buckets).toBeDefined()
      expect(histogram.buckets.length).toBe(12) // Default buckets + +Inf
    })

    it('should use custom buckets', () => {
      recordHistogram('test_histogram', 5, { label: 'test' }, '', [1, 5, 10])

      const metrics = getAllMetrics()
      const histogram = metrics[0] as any
      expect(histogram.buckets).toHaveLength(3)
      expect(histogram.buckets.map(b => b.le)).toEqual([1, 5, 10])
    })
  })

  describe('Metric Queries', () => {
    it('should get all metrics', () => {
      incrementCounter('counter1', 1)
      setGauge('gauge1', 42)

      const metrics = getAllMetrics()
      expect(metrics).toHaveLength(2)
    })

    it('should get metrics by name', () => {
      incrementCounter('test_counter', 1, { label: 'a' })
      incrementCounter('test_counter', 1, { label: 'b' })
      setGauge('other_gauge', 42)

      const metrics = getMetricsByName('test_counter')
      expect(metrics).toHaveLength(2)
      expect(metrics.every(m => m.name === 'test_counter')).toBe(true)
    })

    it('should get latest metric', () => {
      incrementCounter('test_counter', 1)
      incrementCounter('test_counter', 2)

      const latest = getLatestMetric('test_counter')
      expect(latest).toBeDefined()
      expect(latest?.value).toBe(3)
    })

    it('should return undefined for non-existent metric', () => {
      const latest = getLatestMetric('non_existent')
      expect(latest).toBeUndefined()
    })

    it('should get latest metric with specific labels', () => {
      incrementCounter('test_counter', 1, { label: 'a' })
      incrementCounter('test_counter', 2, { label: 'b' })

      const latest = getLatestMetric('test_counter', { label: 'b' })
      expect(latest?.value).toBe(2)
    })
  })

  describe('Prometheus Format', () => {
    it('should format counter metrics', () => {
      incrementCounter('test_counter', 5, { label: 'test' }, 'Test counter')

      const formatted = formatPrometheusMetrics()
      expect(formatted).toContain('# HELP test_counter Test counter')
      expect(formatted).toContain('# TYPE test_counter counter')
      expect(formatted).toContain('test_counter{label="test"} 5')
    })

    it('should format gauge metrics', () => {
      setGauge('test_gauge', 42, { label: 'test' }, 'Test gauge')

      const formatted = formatPrometheusMetrics()
      expect(formatted).toContain('# HELP test_gauge Test gauge')
      expect(formatted).toContain('# TYPE test_gauge gauge')
      expect(formatted).toContain('test_gauge{label="test"} 42')
    })

    it('should format histogram metrics', () => {
      recordHistogram('test_histogram', 0.5, { label: 'test' }, 'Test histogram')

      const formatted = formatPrometheusMetrics()
      expect(formatted).toContain('# HELP test_histogram Test histogram')
      expect(formatted).toContain('# TYPE test_histogram histogram')
      expect(formatted).toContain('test_histogram_sum{label="test"}')
      expect(formatted).toContain('test_histogram_count{label="test"}')
      expect(formatted).toContain('test_histogram_bucket{label="test",le=')
    })

    it('should format multiple metrics', () => {
      incrementCounter('counter1', 1)
      setGauge('gauge1', 42)

      const formatted = formatPrometheusMetrics()
      expect(formatted).toContain('counter1')
      expect(formatted).toContain('gauge1')
    })
  })

  describe('Timer', () => {
    it('should measure duration', async () => {
      const timer = new Timer('test_duration')
      await new Promise(resolve => setTimeout(resolve, 10))
      const duration = timer.stop()

      expect(duration).toBeGreaterThanOrEqual(10)
    })

    it('should record histogram on stop', async () => {
      const timer = new Timer('test_duration')
      await new Promise(resolve => setTimeout(resolve, 10))
      timer.stop()

      const metrics = getMetricsByName('test_duration')
      expect(metrics).toHaveLength(1)
      expect(metrics[0].type).toBe('histogram')
    })

    it('should use Timer.time helper', async () => {
      const result = await Timer.time('test_duration', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'success'
      })

      expect(result).toBe('success')
      const metrics = getMetricsByName('test_duration')
      expect(metrics).toHaveLength(1)
    })

    it('should handle exceptions in Timer.time', async () => {
      await expect(
        Timer.time('test_duration', () => {
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')

      const metrics = getMetricsByName('test_duration')
      expect(metrics).toHaveLength(1)
    })

    it('should include labels in timer', async () => {
      const timer = new Timer('test_duration', { operation: 'test' })
      await new Promise(resolve => setTimeout(resolve, 10))
      timer.stop()

      const metrics = getMetricsByName('test_duration')
      expect(metrics[0].labels).toEqual({ operation: 'test' })
    })
  })

  describe('Agent Metrics Constants', () => {
    it('should have defined metric names', () => {
      expect(AgentMetrics.AGENT_START).toBe('agent_start_total')
      expect(AgentMetrics.X402_QUOTES_CREATED).toBe('x402_quotes_created_total')
      expect(AgentMetrics.PASSPORT_MINT).toBe('passport_mint_total')
      expect(AgentMetrics.API_REQUESTS_TOTAL).toBe('api_requests_total')
    })

    it('should have all required metric categories', () => {
      expect(AgentMetrics.AGENT_START).toBeDefined()
      expect(AgentMetrics.X402_QUOTES_CREATED).toBeDefined()
      expect(AgentMetrics.PASSPORT_MINT).toBeDefined()
      expect(AgentMetrics.API_REQUESTS_TOTAL).toBeDefined()
    })
  })

  describe('Clear Metrics', () => {
    it('should clear all metrics', () => {
      incrementCounter('test_counter', 1)
      setGauge('test_gauge', 42)

      clearMetrics()

      const metrics = getAllMetrics()
      expect(metrics).toHaveLength(0)
    })
  })
})
