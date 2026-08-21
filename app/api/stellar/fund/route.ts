import * as StellarSdk from "@stellar/stellar-sdk";
import { createApiRouteLogger } from "@/lib/api-logging";

const FRIENDBOT = "https://friendbot.stellar.org";
const HORIZON = "https://horizon-testnet.stellar.org";

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, "/api/stellar/fund");

  try {
    const { publicKey } = await req.json();
    if (!publicKey) {
      return await api.json(
        { error: "Missing publicKey" },
        { status: 400 },
        { reason: "missing_publicKey" },
      );
    }

    const res = await fetch(
      `${FRIENDBOT}?addr=${encodeURIComponent(publicKey)}`,
    );
    if (!res.ok) {
      const txt = await res.text();
      return await api.report(
        "warn",
        new Error(txt),
        { error: `Friendbot failed: ${txt}` },
        { status: 500 },
        { publicKey, reason: "friendbot_failed" },
      );
    }

    // Fetch balance after funding.
    const server = new StellarSdk.Horizon.Server(HORIZON);
    const account = await server.loadAccount(publicKey);
    const native = account.balances.find(
      (b: { asset_type: string }) => b.asset_type === "native",
    ) as { balance: string } | undefined;

    return await api.json(
      { ok: true, balance: native?.balance || "10000" },
      undefined,
      {
        event: "stellar.fund.completed",
        publicKey,
        balance: native?.balance,
      },
    );
  } catch (err) {
    return await api.report(
      "error",
      err,
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
      { reason: "stellar_fund_failed" },
    );
  }
}
