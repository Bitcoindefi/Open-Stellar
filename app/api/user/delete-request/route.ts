import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const contact = typeof body.contact === "string" ? body.contact.trim() : ""
  const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim() : ""

  if (!contact && !walletAddress) {
    return NextResponse.json(
      {
        ok: false,
        error: "Provide a contact email or walletAddress so the deletion request can be reviewed.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      requestId: `del_${Date.now().toString(36)}`,
      status: "received",
      contact: contact || null,
      walletAddress: walletAddress || null,
      message: "Deletion review request received. Production deployments should persist this request and notify legal@open-stellar.xyz.",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
