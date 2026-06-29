import { NextResponse } from "next/server";
import { appendErrorLog } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const route = String(body.route || "/").slice(0, 200);
    const message = String(body.message || "Unknown error").slice(0, 2000);
    const stack =
      typeof body.stack === "string" ? body.stack.slice(0, 12000) : undefined;
    const digest =
      typeof body.digest === "string" ? body.digest.slice(0, 200) : undefined;
    const source = body.source === "route" ? "route" : "global";
    const userAgent = req.headers.get("user-agent")?.slice(0, 500);

    const entry = appendErrorLog({
      source,
      route,
      message,
      stack,
      digest,
      userAgent,
    });

    return NextResponse.json({ ok: true, id: entry.id });
  } catch {
    return NextResponse.json(
      { ok: false, error: "failed_to_log_error" },
      { status: 500 },
    );
  }
}
