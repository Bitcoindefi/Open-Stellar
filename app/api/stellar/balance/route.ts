import * as StellarSdk from "@stellar/stellar-sdk";
import { createApiRouteLogger } from "@/lib/api-logging";

const HORIZON = "https://horizon-testnet.stellar.org";

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/stellar/balance");

  try {
    const { publicKey } = await req.json();
    if (!publicKey) {
      return await api.json(
        { error: "Missing publicKey" },
        { status: 400 },
        { reason: "missing_publicKey" },
      );
    }

    const server = new StellarSdk.Horizon.Server(HORIZON);
    const account = await server.loadAccount(publicKey);
    const native = account.balances.find(
      (b: { asset_type: string }) => b.asset_type === "native",
    ) as { balance: string } | undefined;
    return await api.json(
      {
        ok: true,
        balance: native?.balance || "0",
        funded: !!native && parseFloat(native.balance) > 0,
      },
      undefined,
      {
        event: "stellar.balance.read",
        publicKey,
        funded: !!native && parseFloat(native.balance) > 0,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isNotFound =
      msg.includes("404") ||
      msg.includes("Not Found") ||
      msg.includes("does not exist");
    if (isNotFound) {
      return await api.json(
        { balance: "0", funded: false, error: null },
        undefined,
        { event: "stellar.balance.read", reason: "account_not_found" },
      );
    }

    return await api.report(
      "warn",
      err,
      { balance: "0", funded: false, error: "network" },
      undefined,
      { reason: "horizon_lookup_failed" },
    );
  }
}
