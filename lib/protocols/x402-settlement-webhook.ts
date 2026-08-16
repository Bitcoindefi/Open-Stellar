import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type { SettlementChain, X402Receipt } from "@/lib/protocols/x402"

const DEFAULT_LOG_PATH = join(process.cwd(), ".data", "webhook-log.json")
const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000, 9_000]
const MAX_RETRIES = DEFAULT_RETRY_DELAYS_MS.length
const WEBHOOK_TIMEOUT_MS = 5_000
const MAX_LOG_ENTRIES = 500

const CHAIN_ASSET: Record<SettlementChain, string> = {
  stellar: "XLM",
  bnb: "BNB",
  base: "ETH",
}

const CHAIN_DECIMALS: Record<SettlementChain, number> = {
  stellar: 7,
  bnb: 18,
  base: 18,
}

export interface SettlementWebhookPayload {
  receiptId: string
  agentId: string
  amount: string
  asset: string
  settledAt: string
  explorerUrl: string
}

export type SettlementWebhookLogStatus = "success" | "fail" | "retried"

export interface SettlementWebhookLogEntry {
  id: string
  receiptId: string
  attemptedAt: string
  attempt: number
  status: SettlementWebhookLogStatus
  responseStatus: number | null
  error?: string
}

export type SettlementWebhookDeliveryResult =
  | { status: "skipped"; attempts: 0; payload: SettlementWebhookPayload }
  | { status: "success"; attempts: number; retried: boolean; payload: SettlementWebhookPayload }
  | { status: "failed"; attempts: number; retried: boolean; payload: SettlementWebhookPayload }

interface DeliveryOptions {
  fetcher?: typeof fetch
  webhookUrl?: string
}

let logPath = process.env.WEBHOOK_LOG_PATH || DEFAULT_LOG_PATH
let retryDelaysMs = [...DEFAULT_RETRY_DELAYS_MS]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureLogStore(): void {
  const directory = dirname(logPath)
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  if (!existsSync(logPath)) writeFileSync(logPath, "[]\n", "utf8")
}

export function listSettlementWebhookLogs(): SettlementWebhookLogEntry[] {
  if (!existsSync(logPath)) return []

  try {
    const parsed = JSON.parse(readFileSync(logPath, "utf8")) as unknown
    return Array.isArray(parsed) ? parsed as SettlementWebhookLogEntry[] : []
  } catch {
    return []
  }
}

function appendLogEntry(entry: Omit<SettlementWebhookLogEntry, "id">): void {
  try {
    ensureLogStore()
    const entryId = randomUUID()
    const entries = [...listSettlementWebhookLogs(), { id: entryId, ...entry }]
      .slice(-MAX_LOG_ENTRIES)
    const temporaryPath = `${logPath}.${process.pid}.${entryId}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8")
    renameSync(temporaryPath, logPath)
  } catch {
    // A logging failure must never change a completed settlement.
  }
}

function deliveryLogStatus(ok: boolean, willRetry: boolean): SettlementWebhookLogStatus {
  if (ok) return "success"
  return willRetry ? "retried" : "fail"
}

function formatAtomicAmount(amountUnits: string | undefined, chain: SettlementChain): string {
  if (!amountUnits || !/^\d+$/.test(amountUnits)) return "0"

  const decimals = CHAIN_DECIMALS[chain]
  const padded = amountUnits.padStart(decimals + 1, "0")
  const integer = padded.slice(0, -decimals).replace(/^0+(?=\d)/, "") || "0"
  const fraction = padded.slice(-decimals).replace(/0+$/, "")
  return fraction ? `${integer}.${fraction}` : integer
}

function publicBaseUrl(requestUrl: string): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  return (configuredUrl || new URL(requestUrl).origin).replace(/\/$/, "")
}

export function createSettlementWebhookPayload(input: {
  receipt: X402Receipt & { id?: string; agentId?: string }
  requestUrl: string
  fallbackAgentId?: string
}): SettlementWebhookPayload {
  const { receipt } = input
  const receiptId = receipt.id || receipt.quoteId || receipt.paymentRef

  return {
    receiptId,
    agentId: receipt.agentId || input.fallbackAgentId || "unknown",
    amount: formatAtomicAmount(receipt.amountUnits, receipt.chain),
    asset: CHAIN_ASSET[receipt.chain],
    settledAt: receipt.settledAt,
    explorerUrl: `${publicBaseUrl(input.requestUrl)}/explorer?q=${encodeURIComponent(receiptId)}`,
  }
}

async function postPayload(
  webhookUrl: string,
  payload: SettlementWebhookPayload,
  fetcher: typeof fetch,
): Promise<{ ok: boolean; responseStatus: number | null; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  try {
    const response = await fetcher(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    return response.ok
      ? { ok: true, responseStatus: response.status }
      : { ok: false, responseStatus: response.status, error: `HTTP ${response.status}` }
  } catch (error) {
    return {
      ok: false,
      responseStatus: null,
      error: error instanceof Error ? error.message : "Webhook request failed",
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function deliverSettlementWebhook(
  payload: SettlementWebhookPayload,
  options: DeliveryOptions = {},
): Promise<SettlementWebhookDeliveryResult> {
  const webhookUrl = options.webhookUrl ?? process.env.WEBHOOK_URL
  if (!webhookUrl) return { status: "skipped", attempts: 0, payload }

  const fetcher = options.fetcher ?? fetch

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    const result = await postPayload(webhookUrl, payload, fetcher)
    const willRetry = !result.ok && attempt <= MAX_RETRIES

    appendLogEntry({
      receiptId: payload.receiptId,
      attemptedAt: new Date().toISOString(),
      attempt,
      status: deliveryLogStatus(result.ok, willRetry),
      responseStatus: result.responseStatus,
      ...(result.error ? { error: result.error } : {}),
    })

    if (result.ok) {
      return { status: "success", attempts: attempt, retried: attempt > 1, payload }
    }

    if (willRetry) await sleep(retryDelaysMs[attempt - 1])
  }

  return { status: "failed", attempts: MAX_RETRIES + 1, retried: true, payload }
}

export function setSettlementWebhookLogPathForTests(path: string): void {
  logPath = path
}

export function resetSettlementWebhookLogPathForTests(): void {
  logPath = process.env.WEBHOOK_LOG_PATH || DEFAULT_LOG_PATH
}

export function setSettlementWebhookRetryDelaysForTests(delaysMs: number[]): void {
  retryDelaysMs = [...delaysMs]
}

export function resetSettlementWebhookRetryDelaysForTests(): void {
  retryDelaysMs = [...DEFAULT_RETRY_DELAYS_MS]
}
