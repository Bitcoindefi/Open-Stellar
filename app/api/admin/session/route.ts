import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/api-keys";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  getAdminSessionTokenFromRequest,
  getSessionAdminApiKey,
  isAdminSessionToken,
} from "@/lib/auth/admin-session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json({ authenticated: isAdminSessionToken(getAdminSessionTokenFromRequest(req) ?? "") }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  if (!getSessionAdminApiKey()) {
    return NextResponse.json({ ok: false, error: "Admin login is not configured. Set ADMIN_API_KEY on the server." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as { apiKey?: unknown };
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const result = apiKey ? await verifyApiKey(apiKey) : null;
  if (!result?.valid || !result.isAdmin) {
    return NextResponse.json({ ok: false, error: "Invalid admin API key" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
