import { Client } from "@cosmosapp/pay_sdk"

export const COSMOS_PAY_API_KEY_ENV = "COSMOS_PAY_API_KEY"
export const COSMOS_PAY_WEBHOOK_SECRET_ENV = "COSMOS_PAY_WEBHOOK_SECRET"

export interface CosmosPayIntentInput {
  destination: string
  amount: string
  assetCode?: string
  assetIssuer?: string
  memo?: string
  msg?: string
  reference?: string
}

export interface CosmosPayValidationInput {
  intentId: string
  txHash: string
}

function requireCosmosPayApiKey(): string {
  const apiKey = process.env.COSMOS_PAY_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("COSMOS_PAY_API_KEY is required to use CosmosPay")
  }
  return apiKey
}

export function getCosmosPayClient(): Client {
  return new Client({
    apiKey: requireCosmosPayApiKey(),
    webhookSecret: process.env.COSMOS_PAY_WEBHOOK_SECRET,
  })
}

export function getCosmosPayNetwork(): "testnet" | "mainnet" | "unknown" {
  const apiKey = process.env.COSMOS_PAY_API_KEY?.trim() ?? ""
  if (apiKey.startsWith("dv_")) return "testnet"
  if (apiKey.startsWith("prod_")) return "mainnet"
  return "unknown"
}

function assertAmount(amount: string): string {
  const normalized = amount.trim()
  if (!/^\d+(\.\d{1,7})?$/.test(normalized)) {
    throw new Error("amount must be a decimal string with up to 7 decimals")
  }
  return normalized
}

export async function createCosmosPayIntent(input: CosmosPayIntentInput) {
  const destination = input.destination.trim()
  if (!destination) throw new Error("destination is required")

  const client = getCosmosPayClient()
  const intent = await client.paymentIntents.createPay({
    destination,
    amount: assertAmount(input.amount),
    assetCode: input.assetCode?.trim() || undefined,
    assetIssuer: input.assetIssuer?.trim() || undefined,
    memo: input.memo?.trim() || undefined,
    msg: input.msg?.trim() || input.reference?.trim() || "Open Stellar payment",
  })

  return typeof intent.toJSON === "function" ? intent.toJSON() : intent
}

export async function validateCosmosPayIntent(input: CosmosPayValidationInput) {
  const intentId = input.intentId.trim()
  const txHash = input.txHash.trim()
  if (!intentId) throw new Error("intentId is required")
  if (!/^[a-fA-F0-9]{64}$/.test(txHash)) throw new Error("txHash must be a 64-character transaction hash")

  const client = getCosmosPayClient()
  return client.paymentIntents.validate(intentId, { txHash })
}
