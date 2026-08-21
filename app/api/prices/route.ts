import { NextResponse } from "next/server";
import { getPrices } from "@/lib/prices/coingecko";

export const revalidate = 60;

export async function GET() {
  try {
    const prices = await getPrices();
    return NextResponse.json({ ok: true, prices });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed fetching prices",
      },
      { status: 502 },
    );
  }
}
