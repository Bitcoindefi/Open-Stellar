import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type TransactionSigner,
} from "@solana/kit"
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token"
import { USDC_DECIMALS, USDC_DEVNET_MINT } from "@/lib/solana/payment-constants"

// The one transaction a person signs to fund their agents' wallet: create the wallet's USDC
// account if it does not exist yet (idempotent) and move USDC into it from the person's wallet.
//
// Sponsored (the normal path): the server keypair is the fee payer and pays the one-time rent of
// that USDC account, and signs first; the person only signs the USDC transfer, so they need
// devnet USDC and no SOL. The browser checks the transaction (fundTransactionProblem) before the
// wallet signs it. Without a server keypair, the browser builds an unsponsored version and the
// person's wallet pays the fee and rent. Either way the agents' wallet itself never needs SOL:
// x402 payments are fee-sponsored by the facilitator and withdrawals by the server.

/** What the "Fund" button sends: 0.10 USDC, ten hires at 0.01. */
export const FUND_AMOUNT_MICRO: bigint = BigInt(100000)
export const MAX_FUND_AMOUNT_MICRO: bigint = BigInt(10000000)

export type LatestBlockhash = { blockhash: string; lastValidBlockHeight: bigint }

type FundInput = {
  /** The person's wallet: signs the transfer. */
  payer: string
  agentWallet: string
  amountMicro?: bigint
  latestBlockhash: LatestBlockhash
  mint?: string
}

export async function usdcAccountFor(owner: string, mint: string = USDC_DEVNET_MINT): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({ owner: address(owner), mint: address(mint), tokenProgram: TOKEN_PROGRAM_ADDRESS })
  return ata
}

async function fundMessage(input: FundInput, feePayer: TransactionSigner) {
  const amount = input.amountMicro ?? FUND_AMOUNT_MICRO
  if (amount <= BigInt(0) || amount > MAX_FUND_AMOUNT_MICRO) throw new Error("Fund between 0.000001 and 10 USDC.")
  if (input.payer === input.agentWallet) throw new Error("The agents' wallet cannot fund itself.")
  const mint = address(input.mint ?? USDC_DEVNET_MINT)
  const person = feePayer.address === input.payer ? feePayer : createNoopSigner(address(input.payer))
  const owner = address(input.agentWallet)
  const source = await usdcAccountFor(input.payer, mint)
  const destination = await usdcAccountFor(input.agentWallet, mint)

  return pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: input.latestBlockhash.blockhash as Blockhash, lastValidBlockHeight: input.latestBlockhash.lastValidBlockHeight }, tx),
    (tx) => appendTransactionMessageInstructions([
      getCreateAssociatedTokenIdempotentInstruction({ payer: feePayer, ata: destination, owner, mint }),
      getTransferCheckedInstruction({ source, mint, destination, authority: person, amount, decimals: USDC_DECIMALS }),
    ], tx),
  )
}

/** Unsponsored: the person's wallet pays fee and rent. Wire bytes, unsigned, for signAndSendTransaction. */
export async function buildFundTransaction(input: FundInput): Promise<Uint8Array> {
  const message = await fundMessage(input, createNoopSigner(address(input.payer)))
  return new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)))
}

/** Sponsored: built and signed by the server keypair as fee payer; base64 wire, the person signs next. */
export async function buildSponsoredFundTransaction(input: FundInput & { feePayer: TransactionSigner }): Promise<string> {
  if (input.feePayer.address === input.payer || input.feePayer.address === input.agentWallet) throw new Error("The fee payer must be the server keypair.")
  const message = await fundMessage(input, input.feePayer)
  return getBase64EncodedWireTransaction(await partiallySignTransactionMessageWithSigners(message))
}

/**
 * Why the browser must not sign a funding transaction the server prepared, or null when it is
 * exactly: fee paid by the expected server key, create the agents' USDC account, and transfer at
 * most `maxAmountMicro` USDC from the person's account to it, with nothing else in it.
 */
export async function fundTransactionProblem(bytes: Uint8Array, expected: { payer: string; agentWallet: string; feePayer: string; maxAmountMicro: bigint; mint?: string }): Promise<string | null> {
  const message = decodeMessage(bytes)
  if (!message) return "the transaction could not be decoded"
  const staticAccounts: readonly string[] = message.staticAccounts
  const { instructions } = message
  const signers = message.header.numSignerAccounts
  if (staticAccounts[0] !== expected.feePayer) return "unexpected fee payer"
  if (signers !== 2 || !staticAccounts.slice(0, 2).includes(expected.payer)) return "unexpected signers"
  if (instructions.length !== 2) return "unexpected instructions"
  const mint = expected.mint ?? USDC_DEVNET_MINT
  const account = (ix: (typeof instructions)[number], i: number) => staticAccounts[ix.accountIndices?.[i] ?? -1]
  const [create, transfer] = instructions
  const agentAta = await usdcAccountFor(expected.agentWallet, mint)
  if (staticAccounts[create.programAddressIndex] !== ASSOCIATED_TOKEN_PROGRAM_ADDRESS || create.data?.[0] !== 1) return "unexpected first instruction"
  if (account(create, 1) !== agentAta || account(create, 2) !== expected.agentWallet || account(create, 3) !== mint) return "unexpected account creation"
  if (staticAccounts[transfer.programAddressIndex] !== TOKEN_PROGRAM_ADDRESS || transfer.data?.[0] !== 12 || transfer.data.length !== 10 || transfer.data[9] !== USDC_DECIMALS) return "unexpected second instruction"
  if (account(transfer, 0) !== await usdcAccountFor(expected.payer, mint) || account(transfer, 1) !== mint || account(transfer, 2) !== agentAta || account(transfer, 3) !== expected.payer) return "unexpected transfer accounts"
  let amount = BigInt(0)
  for (let i = 8; i >= 1; i--) amount = amount * BigInt(256) + BigInt(transfer.data[i])
  if (amount <= BigInt(0) || amount > expected.maxAmountMicro) return "unexpected amount"
  return null
}

function decodeMessage(bytes: Uint8Array) {
  try {
    return getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(bytes).messageBytes)
  } catch {
    return null
  }
}
