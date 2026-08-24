import { authMiddleware } from "@/lib/auth/middleware";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  return authMiddleware(req);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/:path*"],
  runtime: "nodejs",
};
