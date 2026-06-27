export type FilterOperator = "eq" | "neq" | "gt" | "lt" | "contains"

export interface WebhookFilter {
  field: string        // dot-path into event payload, e.g. 'agentId' or 'amount'
  operator: FilterOperator
  value: string | number
}

/**
 * Resolve a dot-path like "agentId" or "payload.amount" from an object.
 * Returns undefined if any segment in the path is missing.
 */
function getValueByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined
  const segments = path.split(".")
  let current: unknown = obj

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

function toComparableString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (typeof value === "boolean") return String(value)
  return undefined
}

function toComparableNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Evaluate a single filter against an event payload.
 * Returns true if the filter passes (event should be delivered).
 */
export function evaluateFilter(filter: WebhookFilter, payload: unknown): boolean {
  const actualValue = getValueByPath(payload, filter.field)

  switch (filter.operator) {
    case "eq": {
      const expected = toComparableString(filter.value)
      const actual = toComparableString(actualValue)
      return actual !== undefined && actual === expected
    }
    case "neq": {
      const expected = toComparableString(filter.value)
      const actual = toComparableString(actualValue)
      return actual !== undefined && actual !== expected
    }
    case "gt": {
      const expected = toComparableNumber(filter.value)
      const actual = toComparableNumber(actualValue)
      return actual !== undefined && expected !== undefined && actual > expected
    }
    case "lt": {
      const expected = toComparableNumber(filter.value)
      const actual = toComparableNumber(actualValue)
      return actual !== undefined && expected !== undefined && actual < expected
    }
    case "contains": {
      const expected = String(filter.value)
      const actual = toComparableString(actualValue)
      return actual !== undefined && actual.includes(expected)
    }
    default:
      return false
  }
}

/**
 * Evaluate all filters against a payload.
 * All filters are AND-ed. Empty filters array = deliver everything.
 */
export function evaluateFilters(filters: WebhookFilter[] | undefined, payload: unknown): boolean {
  if (!filters || filters.length === 0) return true
  return filters.every((filter) => evaluateFilter(filter, payload))
}

export function normalizeFilters(value: unknown): WebhookFilter[] {
  if (!Array.isArray(value)) return []

  const filters: WebhookFilter[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue

    const field = String((item as Record<string, unknown>).field ?? "").trim()
    const operator = String((item as Record<string, unknown>).operator ?? "")
    const rawValue = (item as Record<string, unknown>).value

    if (!field) continue
    if (!["eq", "neq", "gt", "lt", "contains"].includes(operator)) continue
    if (rawValue === undefined || rawValue === null) continue
    if (typeof rawValue !== "string" && typeof rawValue !== "number") continue

    filters.push({ field, operator: operator as FilterOperator, value: rawValue })
  }

  return filters
}