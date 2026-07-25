import { createPublicClient, formatEther, getAddress, http, type Address, type Hex } from 'viem'
import { base, bsc } from 'viem/chains'

export type EvmSettlementChain = 'bnb' | 'base'

export interface VerifyEvmPaymentInput {
  chain: EvmSettlementChain
  txHash: string
  expectedTo: string
  expectedValueWei: string
  expectedFrom?: string
  minConfirmations?: number
  rpcUrl?: string
}

export interface EvmPaymentVerification {
  accepted: boolean
  chain: EvmSettlementChain
  txHash: string
  confirmations: number
  blockNumber?: string
  from?: string
  to?: string
  valueWei?: string
  error?: string
}

const DEFAULT_RPC_URLS: Record<EvmSettlementChain, string> = {
  bnb: process.env.NEXT_PUBLIC_BNB_RPC_URL || 'https://bsc-dataseed.binance.org',
  base: process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org',
}

const EVM_CHAINS = {
  bnb: bsc,
  base,
} as const

function isHexTxHash(txHash: string): txHash is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash)
}

function addressesEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  try {
    return getAddress(a) === getAddress(b)
  } catch {
    return false
  }
}

export function getDefaultEvmRpcUrl(chain: EvmSettlementChain): string {
  return DEFAULT_RPC_URLS[chain]
}

export async function verifyEvmPayment(input: VerifyEvmPaymentInput): Promise<EvmPaymentVerification> {
  if (!isHexTxHash(input.txHash)) {
    return { accepted: false, chain: input.chain, txHash: input.txHash, confirmations: 0, error: 'Invalid EVM tx hash format' }
  }

  let expectedTo: Address
  try {
    expectedTo = getAddress(input.expectedTo)
  } catch {
    return { accepted: false, chain: input.chain, txHash: input.txHash, confirmations: 0, error: 'Invalid expected EVM recipient address' }
  }

  const minConfirmations = Math.max(1, Math.floor(input.minConfirmations ?? 1))
  const client = createPublicClient({
    chain: EVM_CHAINS[input.chain],
    transport: http(input.rpcUrl || DEFAULT_RPC_URLS[input.chain]),
  })

  const [tx, receipt, currentBlock] = await Promise.all([
    client.getTransaction({ hash: input.txHash }),
    client.getTransactionReceipt({ hash: input.txHash }),
    client.getBlockNumber(),
  ])

  const confirmations = receipt.blockNumber ? Number(currentBlock - receipt.blockNumber + BigInt(1)) : 0
  const valueWei = tx.value.toString()
  const expectedValueWei = BigInt(input.expectedValueWei)

  if (receipt.status !== 'success') {
    return { accepted: false, chain: input.chain, txHash: input.txHash, confirmations, error: 'EVM transaction reverted' }
  }

  if (confirmations < minConfirmations) {
    return { accepted: false, chain: input.chain, txHash: input.txHash, confirmations, error: 'Insufficient EVM confirmations' }
  }

  if (!addressesEqual(tx.to, expectedTo)) {
    return { accepted: false, chain: input.chain, txHash: input.txHash, confirmations, from: tx.from, to: tx.to ?? undefined, valueWei, error: 'EVM transaction recipient mismatch' }
  }

  if (input.expectedFrom && !addressesEqual(tx.from, input.expectedFrom)) {
    return { accepted: false, chain: input.chain, txHash: input.txHash, confirmations, from: tx.from, to: tx.to ?? undefined, valueWei, error: 'EVM transaction sender mismatch' }
  }

  if (tx.value < expectedValueWei) {
    return { accepted: false, chain: input.chain, txHash: input.txHash, confirmations, from: tx.from, to: tx.to ?? undefined, valueWei, error: `EVM payment too small: ${formatEther(tx.value)} native` }
  }

  return {
    accepted: true,
    chain: input.chain,
    txHash: input.txHash,
    confirmations,
    blockNumber: receipt.blockNumber.toString(),
    from: tx.from,
    to: tx.to ?? undefined,
    valueWei,
  }
}
