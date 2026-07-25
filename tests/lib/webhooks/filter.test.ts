import { describe, it, expect } from "vitest"
import {
  evaluateFilter,
  evaluateFilters,
  normalizeFilters,
  type WebhookFilter,
} from "@/lib/webhooks/filter"

describe("evaluateFilter", () => {
  // ─── eq ────────────────────────────────────────────────────────────
  it("eq matches exact string", () => {
    const filter: WebhookFilter = { field: "agentId", operator: "eq", value: "bot-1" }
    expect(evaluateFilter(filter, { agentId: "bot-1" })).toBe(true)
    expect(evaluateFilter(filter, { agentId: "bot-2" })).toBe(false)
  })

  it("eq matches number as string", () => {
    const filter: WebhookFilter = { field: "amount", operator: "eq", value: "100" }
    expect(evaluateFilter(filter, { amount: 100 })).toBe(true)
    expect(evaluateFilter(filter, { amount: 200 })).toBe(false)
  })

  it("eq fails on missing field", () => {
    const filter: WebhookFilter = { field: "missing", operator: "eq", value: "x" }
    expect(evaluateFilter(filter, { agentId: "bot-1" })).toBe(false)
  })

  // ─── neq ───────────────────────────────────────────────────────────
  it("neq excludes matching value", () => {
    const filter: WebhookFilter = { field: "agentId", operator: "neq", value: "bot-1" }
    expect(evaluateFilter(filter, { agentId: "bot-2" })).toBe(true)
    expect(evaluateFilter(filter, { agentId: "bot-1" })).toBe(false)
  })

  // ─── gt ────────────────────────────────────────────────────────────
  it("gt matches values above threshold", () => {
    const filter: WebhookFilter = { field: "amount", operator: "gt", value: 100 }
    expect(evaluateFilter(filter, { amount: 150 })).toBe(true)
    expect(evaluateFilter(filter, { amount: 100 })).toBe(false)
    expect(evaluateFilter(filter, { amount: 50 })).toBe(false)
  })

  it("gt works with string numbers", () => {
    const filter: WebhookFilter = { field: "amount", operator: "gt", value: 100 }
    expect(evaluateFilter(filter, { amount: "150" })).toBe(true)
  })

  // ─── lt ────────────────────────────────────────────────────────────
  it("lt matches values below threshold", () => {
    const filter: WebhookFilter = { field: "amount", operator: "lt", value: 100 }
    expect(evaluateFilter(filter, { amount: 50 })).toBe(true)
    expect(evaluateFilter(filter, { amount: 100 })).toBe(false)
    expect(evaluateFilter(filter, { amount: 150 })).toBe(false)
  })

  // ─── contains ──────────────────────────────────────────────────────
  it("contains matches substring", () => {
    const filter: WebhookFilter = { field: "message", operator: "contains", value: "payment" }
    expect(evaluateFilter(filter, { message: "payment received" })).toBe(true)
    expect(evaluateFilter(filter, { message: "no match here" })).toBe(false)
  })

  // ─── dot-path ──────────────────────────────────────────────────────
  it("resolves dot-path fields", () => {
    const filter: WebhookFilter = { field: "payload.amount", operator: "gt", value: 50 }
    expect(evaluateFilter(filter, { payload: { amount: 100 } })).toBe(true)
    expect(evaluateFilter(filter, { payload: { amount: 20 } })).toBe(false)
  })

  it("handles missing nested path", () => {
    const filter: WebhookFilter = { field: "payload.missing", operator: "eq", value: "x" }
    expect(evaluateFilter(filter, { payload: {} })).toBe(false)
    expect(evaluateFilter(filter, {})).toBe(false)
  })
})

describe("evaluateFilters", () => {
  it("empty filters = deliver everything", () => {
    expect(evaluateFilters([], { agentId: "bot-1" })).toBe(true)
    expect(evaluateFilters(undefined, { agentId: "bot-1" })).toBe(true)
  })

  it("ANDs multiple filters", () => {
    const filters: WebhookFilter[] = [
      { field: "agentId", operator: "eq", value: "bot-1" },
      { field: "amount", operator: "gt", value: 100 },
    ]
    expect(evaluateFilters(filters, { agentId: "bot-1", amount: 150 })).toBe(true)
    expect(evaluateFilters(filters, { agentId: "bot-1", amount: 50 })).toBe(false)
    expect(evaluateFilters(filters, { agentId: "bot-2", amount: 150 })).toBe(false)
  })
})

describe("normalizeFilters", () => {
  it("normalizes valid filters", () => {
    const result = normalizeFilters([
      { field: "agentId", operator: "eq", value: "bot-1" },
      { field: "amount", operator: "gt", value: 100 },
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ field: "agentId", operator: "eq", value: "bot-1" })
  })

  it("filters out invalid entries", () => {
    const result = normalizeFilters([
      { field: "", operator: "eq", value: "x" },
      { field: "ok", operator: "invalid", value: "x" },
      { field: "ok", operator: "eq", value: null },
      { field: "ok", operator: "eq", value: "valid" },
      "not an object",
    ])
    expect(result).toHaveLength(1)
    expect(result[0].field).toBe("ok")
  })

  it("returns empty array for non-array input", () => {
    expect(normalizeFilters(null)).toEqual([])
    expect(normalizeFilters("string")).toEqual([])
  })
})