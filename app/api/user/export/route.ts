import { NextResponse } from "next/server"

export async function GET() {
  const exportedAt = new Date().toISOString()

  return NextResponse.json(
    {
      exportedAt,
      formatVersion: "2026-06-24",
      dataControllerContact: "legal@open-stellar.xyz",
      userData: {
        walletAddresses: [],
        agentConfigs: [],
        x402Receipts: [],
        reputationScores: [],
        escrowRecords: [],
      },
      notes: [
        "This export endpoint returns off-chain data known to this deployment.",
        "Self-hosted deployments should connect this route to their database before production launch.",
        "Private keys, seed phrases, identity documents, and payment card data are not collected by Open Stellar.",
        "On-chain data is public on the underlying blockchain and cannot be deleted by this API.",
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="open-stellar-export-${exportedAt.slice(0, 10)}.json"`,
      },
    },
  )
}
