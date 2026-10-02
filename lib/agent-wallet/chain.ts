import {
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Blockhash,
  type KeyPairSigner,
} from "@solana/kit"
import { getCloseAccountInstruction, getTransferCheckedInstruction } from "@solana-program/token"
import { usdcAccountFor } from "@/lib/agent-wallet/fund-tx"
import { USDC_DECIMALS, USDC_DEVNET_MINT } from "@/lib/solana/payment-constants"

// Server-side chain reads and the withdrawal for the agents' wallet. Withdraw-all sends every
// USDC back to a wallet the person names and closes the token account; its rent goes back to
// the server keypair, which paid it in the sponsored funding transaction. The agents' wallet
// holds no SOL: the server keypair (SOLANA_SERVER_SECRET) pays the network fee of each withdrawal.

type Pending<T> = { send: () => Promise<T> }

/** The few RPC methods used here (a subset of @solana/kit's Solana RPC), so tests can fake them. */
export type WalletRpc = {
  getAccountInfo: (account: string, config: { encoding: "jsonParsed"; commitment?: "confirmed" }) => Pending<{ value: { data: unknown } | null }>
  getLatestBlockhash: (config?: { commitment?: "confirmed" }) => Pending<{ value: { blockhash: string; lastValidBlockHeight: bigint } }>
  sendTransaction: (wire: string, config: { encoding: "base64"; preflightCommitment?: "confirmed" }) => Pending<string>
  getSignatureStatuses: (signatures: string[]) => Pending<{ value: Array<{ confirmationStatus?: string | null; err?: unknown } | null> }>
}

export function serverRpcUrl(env: Record<string, string | undefined> = process.env): string {
  return env.SOLANA_DEVNET_RPC_URL?.trim() || env.SOLANA_RPC?.trim() || "https://api.devnet.solana.com"
}

export function createWalletRpc(url: string = serverRpcUrl()): WalletRpc {
  return createSolanaRpc(url) as unknown as WalletRpc
}

function tokenAmount(data: unknown): bigint | null {
  const parsed = (data as { parsed?: { info?: { tokenAmount?: { amount?: unknown } } } } | null)?.parsed
  const amount = parsed?.info?.tokenAmount?.amount
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) return null
  return BigInt(amount)
}

/** USDC (in micro units) held by `owner`'s associated token account; 0 when it has none. */
export async function getUsdcBalance(rpc: WalletRpc, owner: string, mint: string = USDC_DEVNET_MINT): Promise<bigint> {
  const ata = await usdcAccountFor(owner, mint)
  const { value } = await rpc.getAccountInfo(ata, { encoding: "jsonParsed", commitment: "confirmed" }).send()
  if (!value) return BigInt(0)
  const amount = tokenAmount(value.data)
  if (amount === null) throw new Error("The agents' wallet USDC account could not be read.")
  return amount
}

export async function waitForConfirmation(rpc: WalletRpc, signature: string, options: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<boolean> {
  const attempts = options.attempts ?? 30
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  for (let i = 0; i < attempts; i++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send()
    const status = value[0]
    if (status?.err) throw new Error("The withdrawal failed on-chain.")
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return true
    await sleep(options.delayMs ?? 1000)
  }
  return false
}

export type WithdrawResult =
  | { ok: true; signature: string; amountMicro: bigint; confirmed: boolean }
  | { ok: false; status: number; error: string }

/** Moves every USDC from the agents' wallet to `destination` and closes its token account. */
export async function withdrawAll(input: {
  rpc: WalletRpc
  agent: KeyPairSigner
  feePayer: KeyPairSigner
  destination: string
  mint?: string
  confirm?: Parameters<typeof waitForConfirmation>[2]
}): Promise<WithdrawResult> {
  const mint = address(input.mint ?? USDC_DEVNET_MINT)
  if (input.destination === input.agent.address) return { ok: false, status: 400, error: "Choose a wallet other than the agents' wallet." }
  if (input.feePayer.address === input.agent.address) return { ok: false, status: 500, error: "The fee payer cannot be the agents' wallet." }

  const amount = await getUsdcBalance(input.rpc, input.agent.address, mint)
  if (amount <= BigInt(0)) return { ok: false, status: 409, error: "The agents' wallet has no USDC to withdraw." }

  // The destination must already hold devnet USDC (the wallet that funded this one does), so
  // the server never pays rent to open token accounts for arbitrary addresses.
  const destinationAta = await usdcAccountFor(input.destination, mint)
  const destinationInfo = await input.rpc.getAccountInfo(destinationAta, { encoding: "jsonParsed", commitment: "confirmed" }).send()
  if (!destinationInfo.value) return { ok: false, status: 409, error: "That wallet has no devnet USDC account yet. Withdraw to the wallet you funded from." }

  const source = await usdcAccountFor(input.agent.address, mint)
  const { value: latest } = await input.rpc.getLatestBlockhash({ commitment: "confirmed" }).send()
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(input.feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: latest.blockhash as Blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, tx),
    (tx) => appendTransactionMessageInstructions([
      getTransferCheckedInstruction({ source, mint, destination: destinationAta, authority: input.agent, amount, decimals: USDC_DECIMALS }),
      getCloseAccountInstruction({ account: source, destination: input.feePayer.address, owner: input.agent }),
    ], tx),
  )
  const signed = await signTransactionMessageWithSigners(message)
  const signature = getSignatureFromTransaction(signed)
  await input.rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: "base64", preflightCommitment: "confirmed" }).send()
  const confirmed = await waitForConfirmation(input.rpc, signature, input.confirm)
  return { ok: true, signature, amountMicro: amount, confirmed }
}
