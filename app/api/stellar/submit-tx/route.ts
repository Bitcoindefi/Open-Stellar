import * as StellarSdk from "@stellar/stellar-sdk";
import { createApiRouteLogger } from "@/lib/api-logging";

const HORIZON = "https://horizon-testnet.stellar.org";

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/stellar/submit-tx");

  try {
    const { signedXdr } = await req.json();
    if (!signedXdr) {
      return await api.json(
        { error: "Missing signedXdr" },
        { status: 400 },
        { reason: "missing_signedXdr" },
      );
    }

    const server = new StellarSdk.Horizon.Server(HORIZON);
    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      StellarSdk.Networks.TESTNET,
    );
    const result = await server.submitTransaction(transaction);
    const hash = (result as { hash?: string }).hash;
    if (!hash) {
      return await api.report(
        "error",
        new Error("Transaction submitted but no hash returned"),
        { error: "Transaction submitted but no hash returned" },
        { status: 502 },
        { reason: "missing_tx_hash" },
      );
    }
    return await api.json({ ok: true, hash }, undefined, {
      event: "stellar.submit_tx.completed",
      txHash: hash,
    });
  } catch (err) {
    return await api.report(
      "error",
      err,
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
      { reason: "stellar_submit_tx_failed" },
    );
  }
}
