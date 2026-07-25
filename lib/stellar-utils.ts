import freighter from '@stellar/freighter-api'
import { Asset, BASE_FEE, Horizon, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk'

type FreighterLikeResponse = string | { [key: string]: unknown } | null | undefined

function getFreighterError(value: FreighterLikeResponse): string | null {
  if (!value || typeof value === 'string') return null

  const rawError = value.error
  if (!rawError) return null

  if (typeof rawError === 'string') return rawError
  if (typeof rawError === 'object' && rawError !== null && 'message' in rawError) {
    const message = rawError.message
    if (typeof message === 'string') return message
  }

  return 'Freighter returned an unknown error'
}

function getFreighterAddress(value: FreighterLikeResponse): string | null {
  if (!value) return null
  if (typeof value === 'string') return value || null

  const address = value.address
  if (typeof address === 'string' && address.length > 0) return address

  const publicKey = value.publicKey
  if (typeof publicKey === 'string' && publicKey.length > 0) return publicKey

  return null
}

function getSignedXdr(value: FreighterLikeResponse): string | null {
  if (!value) return null
  if (typeof value === 'string') return value || null

  const signedTxXdr = value.signedTxXdr
  if (typeof signedTxXdr === 'string' && signedTxXdr.length > 0) return signedTxXdr

  const signedTransaction = value.signedTransaction
  if (typeof signedTransaction === 'string' && signedTransaction.length > 0) return signedTransaction

  return null
}

// Stellar Testnet configuration
export const STELLAR_TESTNET = {
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  friendbotUrl: 'https://friendbot.stellar.org'
}

export const STELLAR_MAINNET = {
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
}

export type StellarNetwork = 'TESTNET' | 'PUBLIC'

function validateStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address)
}

// Check if Freighter extension is installed
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const result = await freighter.isConnected() as unknown
    if (typeof result === 'boolean') return result
    if (typeof result === 'object' && result !== null && 'isConnected' in result) {
      return Boolean(result.isConnected)
    }
    return Boolean(result)
  } catch {
    return false
  }
}

// Check if the user has granted access to the Freighter wallet
export async function isFreighterAllowed(): Promise<boolean> {
  try {
    const result = await freighter.isAllowed() as unknown
    if (typeof result === 'boolean') return result
    if (typeof result === 'object' && result !== null && 'isAllowed' in result) {
      return Boolean(result.isAllowed)
    }
    return Boolean(result)
  } catch {
    return false
  }
}

// Request access to Freighter wallet
export async function connectFreighter(): Promise<{ publicKey: string | null; error: string | null }> {
  try {
    const isInstalled = await isFreighterInstalled()
    
    if (!isInstalled) {
      return { 
        publicKey: null, 
        error: 'Freighter wallet is not installed. Please install it from https://freighter.app' 
      }
    }

    // Request access
    const accessResult = await freighter.requestAccess() as FreighterLikeResponse
    const accessError = getFreighterError(accessResult)
    if (accessError) {
      return { publicKey: null, error: accessError }
    }

    const publicKey = getFreighterAddress(accessResult)
    if (!publicKey) {
      return { publicKey: null, error: 'Freighter did not return a public key' }
    }

    return { publicKey, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect to Freighter'
    return { publicKey: null, error: message }
  }
}

// Get the current public key from Freighter
export async function getFreighterPublicKey(): Promise<string | null> {
  try {
    const isAllowed = await isFreighterAllowed()
    if (!isAllowed) return null
    
    const result = await freighter.getPublicKey() as FreighterLikeResponse
    const publicKey = getFreighterAddress(result)
    return publicKey || null
  } catch {
    return null
  }
}

// Get the current network from Freighter
export async function getFreighterNetwork(): Promise<StellarNetwork | null> {
  try {
    const networkDetails = await freighter.getNetworkDetails() as string | {
      network?: string
      networkPassphrase?: string
    }

    if (typeof networkDetails === 'string') {
      if (networkDetails === 'TESTNET') return 'TESTNET'
      if (networkDetails === 'PUBLIC') return 'PUBLIC'
      return null
    }

    if (networkDetails.networkPassphrase === STELLAR_TESTNET.networkPassphrase || networkDetails.network === 'TESTNET') {
      return 'TESTNET'
    } else if (networkDetails.networkPassphrase === STELLAR_MAINNET.networkPassphrase || networkDetails.network === 'PUBLIC') {
      return 'PUBLIC'
    }
    
    return null
  } catch {
    return null
  }
}

// Fund testnet account using friendbot
export async function fundTestnetAccount(publicKey: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const response = await fetch(`${STELLAR_TESTNET.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`)
    
    if (response.ok) {
      return { success: true, error: null }
    } else {
      const errorText = await response.text()
      return { success: false, error: errorText }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fund account'
    return { success: false, error: message }
  }
}

// Sign a transaction with Freighter
export async function signTransaction(
  xdr: string, 
  network: StellarNetwork = 'TESTNET'
): Promise<{ signedXdr: string | null; error: string | null }> {
  try {
    const networkPassphrase = network === 'TESTNET' 
      ? STELLAR_TESTNET.networkPassphrase 
      : STELLAR_MAINNET.networkPassphrase

    const signResult = await freighter.signTransaction(xdr, {
      networkPassphrase
    }) as FreighterLikeResponse

    const signError = getFreighterError(signResult)
    if (signError) {
      return { signedXdr: null, error: signError }
    }

    const signedXdr = getSignedXdr(signResult)
    if (!signedXdr) {
      return { signedXdr: null, error: 'Freighter did not return a signed transaction' }
    }

    return { signedXdr, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sign transaction'
    return { signedXdr: null, error: message }
  }
}

// Disconnect Freighter (clear local state, Freighter doesn't have explicit disconnect)
export function disconnectFreighter(): void {
  // Freighter doesn't have an explicit disconnect method
  // The dApp just stops tracking the connection
}

export async function sendStellarPayment(params: {
  sourcePublicKey: string
  destinationPublicKey: string
  amount: string
  network?: StellarNetwork
}): Promise<{ txHash: string | null; error: string | null }> {
  const { sourcePublicKey, destinationPublicKey, amount, network = 'TESTNET' } = params

  try {
    if (!validateStellarAddress(sourcePublicKey) || !validateStellarAddress(destinationPublicKey)) {
      return { txHash: null, error: 'Invalid Stellar address' }
    }

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return { txHash: null, error: 'Invalid XLM amount' }
    }

    const config = network === 'TESTNET' ? STELLAR_TESTNET : STELLAR_MAINNET
    const server = new Horizon.Server(config.networkUrl)
    const account = await server.loadAccount(sourcePublicKey)
    const baseFee = await server.fetchBaseFee().catch(() => BASE_FEE)

    const tx = new TransactionBuilder(account, {
      fee: String(baseFee),
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destinationPublicKey,
          asset: Asset.native(),
          amount,
        })
      )
      .setTimeout(180)
      .build()

    const { signedXdr, error: signError } = await signTransaction(tx.toXDR(), network)
    if (signError || !signedXdr) {
      return { txHash: null, error: signError || 'Failed to sign transaction' }
    }

    const signedTx = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase)
    const result = await server.submitTransaction(signedTx)

    return { txHash: result.hash, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit Stellar transaction'
    return { txHash: null, error: message }
  }
}

export interface VerifyStellarPaymentInput {
  txHash: string
  expectedDestination: string
  expectedAmount: string
  expectedSource?: string
  memo?: string
  network?: StellarNetwork
}

export interface StellarPaymentVerification {
  accepted: boolean
  txHash: string
  source?: string
  destination?: string
  amount?: string
  error?: string
}

export async function verifyStellarPayment(input: VerifyStellarPaymentInput): Promise<StellarPaymentVerification> {
  if (!/^[a-fA-F0-9]{64}$/.test(input.txHash)) {
    return { accepted: false, txHash: input.txHash, error: 'Invalid Stellar tx hash format' }
  }

  const config = input.network === 'PUBLIC' ? STELLAR_MAINNET : STELLAR_TESTNET
  const server = new Horizon.Server(config.networkUrl)

  try {
    const [transaction, operations] = await Promise.all([
      server.transactions().transaction(input.txHash).call(),
      server.operations().forTransaction(input.txHash).call(),
    ])

    if (!transaction.successful) {
      return { accepted: false, txHash: input.txHash, error: 'Stellar transaction failed' }
    }

    if (input.memo && transaction.memo !== input.memo) {
      return { accepted: false, txHash: input.txHash, error: 'Stellar transaction memo mismatch' }
    }

    const payment = operations.records.find((operation) => {
      if (operation.type !== 'payment') return false
      const record = operation as typeof operation & {
        from?: string
        to?: string
        asset_type?: string
        amount?: string
      }
      return record.asset_type === 'native'
        && record.to === input.expectedDestination
        && (!input.expectedSource || record.from === input.expectedSource)
        && Number(record.amount) >= Number(input.expectedAmount)
    }) as ({ from?: string; to?: string; amount?: string } | undefined)

    if (!payment) {
      return { accepted: false, txHash: input.txHash, error: 'Matching Stellar payment operation not found' }
    }

    return {
      accepted: true,
      txHash: input.txHash,
      source: payment.from,
      destination: payment.to,
      amount: payment.amount,
    }
  } catch (err) {
    return { accepted: false, txHash: input.txHash, error: err instanceof Error ? err.message : 'Failed to verify Stellar payment' }
  }
}
