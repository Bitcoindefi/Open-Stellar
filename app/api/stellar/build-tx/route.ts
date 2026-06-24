import { NextResponse } from "next/server"
import * as StellarSdk from "@stellar/stellar-sdk"
import { isMockMode } from "@/lib/mock/mock-mode"
import { mockStellar } from "@/lib/mock/stellar-mock"

const HORIZON = "https://horizon-testnet.stellar.org"

export async function POST(req: Request) {
  try {
    const { sourcePublic, destination, amount } = await req.json()
    if (!sourcePublic || !destination || !amount) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }
    if (isMockMode()) return NextResponse.json(await mockStellar.buildTx({ sourcePublic, destination, amount }))

    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0 || parsedAmount > 900_000_000) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }
    const xlmAmount = parsedAmount.toFixed(7)

    const server = new StellarSdk.Horizon.Server(HORIZON)
    const sourceAccount = await server.loadAccount(sourcePublic)

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination,
          asset: StellarSdk.Asset.native(),
          amount: xlmAmount,
        })
      )
      .setTimeout(30)
      .build()

    return NextResponse.json({ ok: true, xdr: transaction.toXDR() })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

