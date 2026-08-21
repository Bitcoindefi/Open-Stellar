import * as StellarSdk from "@stellar/stellar-sdk";
import { createApiRouteLogger } from "@/lib/api-logging";

const HORIZON = "https://horizon-testnet.stellar.org";

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/stellar/build-tx");

  try {
    const { sourcePublic, destination, amount } = await req.json();
    if (!sourcePublic || !destination || !amount) {
      return await api.json(
        { error: "Missing params" },
        { status: 400 },
        { reason: "missing_params" },
      );
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || parsedAmount > 900_000_000) {
      return await api.json(
        { error: "Invalid amount" },
        { status: 400 },
        { reason: "invalid_amount" },
      );
    }
    const xlmAmount = parsedAmount.toFixed(7);

    const server = new StellarSdk.Horizon.Server(HORIZON);
    const sourceAccount = await server.loadAccount(sourcePublic);

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination,
          asset: StellarSdk.Asset.native(),
          amount: xlmAmount,
        }),
      )
      .setTimeout(30)
      .build();

    return await api.json({ ok: true, xdr: transaction.toXDR() }, undefined, {
      event: "stellar.build_tx.created",
      sourcePublic,
      destination,
      amount: xlmAmount,
    });
  } catch (err) {
    return await api.report(
      "error",
      err,
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
      { reason: "stellar_build_tx_failed" },
    );
  }
}
