import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkTierRateLimit,
  verifyApiKey,
  type ApiKeyTier,
  type VerificationResult,
} from "./api-keys";

export interface AuthEvaluationResult {
  allowed: boolean;
  status: number;
  error?: string;
  tier: ApiKeyTier;
  scopes: string[];
  isAdmin: boolean;
  headers?: Record<string, string>;
}

/**
 * Extracts API key from Authorization header (Bearer osk_live_...) or x-api-key header.
 * Query parameter API keys are intentionally unsupported to prevent leakage in access logs and URL history.
 */
export function extractApiKey(req: Request | NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice(7).trim();
    if (key) return key;
  }

  const customHeader = req.headers.get("x-api-key");
  if (customHeader?.trim()) {
    return customHeader.trim();
  }

  return null;
}

/**
 * Normalises an IP string for safe comparison:
 * - Lowercases (IPv6 hex digits can be upper-case: FE80::1)
 * - Strips IPv6 bracket+port suffix: [::1]:80 → ::1
 * - Strips IPv4 port suffix: 1.2.3.4:8080 → 1.2.3.4
 */
function normalizeIp(ip: string): string {
  const t = ip.trim().toLowerCase();
  // IPv6 bracket-port: [fe80::1]:80
  if (t.startsWith("[")) {
    const bracket = t.indexOf("]");
    return bracket !== -1 ? t.slice(1, bracket) : t;
  }
  // IPv4 with port: 1.2.3.4:443 — only strip if there is exactly one colon
  const colonCount = (t.match(/:/g) || []).length;
  if (colonCount === 1) {
    return t.split(":")[0]!;
  }
  return t;
}

/**
 * Checks if an IP is a known internal/loopback/private network address.
 * Always call with a normalised (lowercase, port-stripped) IP.
 */
function isPrivateOrProxyIp(ip: string): boolean {
  const n = normalizeIp(ip);
  if (
    n === "127.0.0.1" ||
    n === "::1" ||
    n === "localhost" ||
    n.startsWith("10.") ||
    n.startsWith("192.168.") ||
    n.startsWith("169.254.") ||
    n.startsWith("fc00:") ||
    n.startsWith("fe80:")
  ) {
    return true;
  }
  if (n.startsWith("172.")) {
    const parts = n.split(".");
    const second = Number.parseInt(parts[1] || "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Robust client IP extraction.
 *
 * Priority order:
 *   1. `cf-connecting-ip` — set by Cloudflare, not client-controlled.
 *   2. `x-real-ip` — set by Nginx/trusted reverse proxy.
 *   3. `x-forwarded-for` via TRUSTED_PROXY_COUNT strategy:
 *      - If `TRUSTED_PROXY_COUNT` env var is set (e.g. "1" on Vercel), take
 *        the Nth-from-right entry where N = trustedProxyCount. This is safe
 *        because all N rightmost hops are added by your own infrastructure.
 *      - Otherwise fall back to the right-most non-private hop (best effort).
 */
export function getClientIp(req: Request | NextRequest): string {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp?.trim()) {
    return normalizeIp(cfConnectingIp);
  }

  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp?.trim()) {
    return normalizeIp(xRealIp);
  }

  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor
      .split(",")
      .map((ip) => normalizeIp(ip))
      .filter(Boolean);

    // TRUSTED_PROXY_COUNT: when set, the infrastructure appended exactly that
    // many hops. Pick the entry immediately before those trusted hops.
    const trustedProxyCount = Number.parseInt(
      process.env.TRUSTED_PROXY_COUNT || "0",
      10,
    );
    if (trustedProxyCount > 0 && ips.length > 0) {
      const idx = Math.max(0, ips.length - 1 - trustedProxyCount);
      return ips[idx]!;
    }

    // Best-effort fallback: rightmost non-private hop.
    const clientIp = [...ips].reverse().find((ip) => !isPrivateOrProxyIp(ip));
    if (clientIp) return clientIp;
    if (ips.length > 0) return ips[0]!;
  }

  return "127.0.0.1";
}

/**
 * Static and framework asset allowlist
 */
export function isStaticOrInternalPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/public") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.json" ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff|woff2|ttf|eot)$/i.test(
      pathname,
    )
  );
}

/**
 * Public UI Pages allowlist
 */
const PUBLIC_PAGE_PREFIXES = [
  "/explorer",
  "/feed",
  "/leaderboard",
  "/marketplace",
  "/districts",
  "/docs",
  "/agents",
  "/credential",
  "/legal",
  "/offline",
];

export function isPublicPage(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Public API Routes allowlist (Read-only endpoints, protocol negotiation, and public telemetry)
 */
export function isPublicApiRoute(pathname: string, method: string): boolean {
  if (method === "GET" || method === "HEAD") {
    if (
      pathname === "/api/agents" ||
      pathname.startsWith("/api/agents/") ||
      pathname === "/api/feed" ||
      pathname === "/api/leaderboard" ||
      pathname === "/api/badges" ||
      pathname === "/api/skills" ||
      pathname.startsWith("/api/skills/") ||
      pathname === "/api/prices" ||
      pathname === "/api/events" ||
      pathname.startsWith("/api/events/") ||
      pathname.startsWith("/api/districts/") ||
      pathname.startsWith("/api/explorer/") ||
      pathname === "/api/openapi.json" ||
      pathname === "/api/webhooks/event-types" ||
      pathname === "/api/tasks" ||
      pathname.startsWith("/api/tasks/") ||
      pathname.startsWith("/api/tasks/dead-letter") ||
      pathname.startsWith("/api/protocol/passport/status") ||
      pathname.startsWith("/api/protocol/passport/health") ||
      pathname.startsWith("/api/protocol/reputation") ||
      pathname.startsWith("/api/protocol/track8004") ||
      pathname.startsWith("/api/protocol/x402/receipts") ||
      pathname.startsWith("/api/subscriptions/") ||
      pathname.startsWith("/api/stellar/balance") ||
      pathname === "/api/user/export"
    ) {
      return true;
    }
  }

  // Public state machines and payment handshakes
  if (method === "POST") {
    if (
      pathname === "/api/protocol/x402/quote" ||
      pathname === "/api/protocol/x402/settle" ||
      pathname === "/api/protocol/passport/authorize" ||
      pathname === "/api/quests" ||
      pathname.startsWith("/api/quests/")
    ) {
      return true;
    }
  }

  return false;
}

function evaluateAdminRoute(
  apiKey: string | null,
  authResult: VerificationResult,
  isDevBypass: boolean,
): AuthEvaluationResult {
  if (isDevBypass) {
    return {
      allowed: true,
      status: 200,
      tier: "admin",
      scopes: ["*"],
      isAdmin: true,
    };
  }

  if (!apiKey) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Admin API key required",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  if (!authResult.valid || !authResult.isAdmin) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Invalid or revoked API key",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  return {
    allowed: true,
    status: 200,
    tier: authResult.tier,
    scopes: authResult.scopes,
    isAdmin: true,
  };
}

/**
 * Unified evaluator for scoped state-mutating operations.
 */
function evaluateScopedWriteRoute(
  apiKey: string | null,
  authResult: VerificationResult,
  isDevBypass: boolean,
  requiredScope: string,
  resourceName: string,
): AuthEvaluationResult | null {
  if (isDevBypass) {
    return null;
  }

  if (!apiKey) {
    return {
      allowed: false,
      status: 401,
      error: `Unauthorized: API key required for ${resourceName}`,
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  if (!authResult.valid) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Invalid or revoked API key",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  const hasRequiredScope =
    authResult.isAdmin ||
    authResult.scopes.includes("*") ||
    authResult.scopes.includes(requiredScope);

  if (!hasRequiredScope) {
    return {
      allowed: false,
      status: 403,
      error: `Forbidden: Missing required scope ${requiredScope}`,
      tier: authResult.tier,
      scopes: authResult.scopes,
      isAdmin: false,
    };
  }

  return null;
}

function evaluateRateLimit(
  authResult: VerificationResult,
  clientIp: string,
): { allowed: boolean; status: number; headers: Record<string, string>; error?: string } {
  const rateLimitIdentifier =
    authResult.valid && authResult.record?.id ? authResult.record.id : clientIp;

  const rateLimitStatus = checkTierRateLimit(
    rateLimitIdentifier,
    authResult.tier,
  );

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rateLimitStatus.limit),
    "X-RateLimit-Remaining": String(rateLimitStatus.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rateLimitStatus.resetTimeMs / 1000)),
    "X-Api-Tier": authResult.tier,
  };

  if (!rateLimitStatus.allowed) {
    headers["Retry-After"] = String(rateLimitStatus.retryAfterSeconds);
    return {
      allowed: false,
      status: 429,
      error: "rate_limit_exceeded",
      headers,
    };
  }

  return {
    allowed: true,
    status: 200,
    headers,
  };
}

function evaluateStateMutatingRoutes(
  pathname: string,
  method: string,
  apiKey: string | null,
  authResult: VerificationResult,
  isDevBypass: boolean,
): AuthEvaluationResult | null {
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (!isMutating) return null;

  if (pathname === "/api/agents" || pathname.startsWith("/api/agents/")) {
    return evaluateScopedWriteRoute(
      apiKey,
      authResult,
      isDevBypass,
      "agents:write",
      "agent management",
    );
  }

  if (pathname === "/api/webhooks" || pathname.startsWith("/api/webhooks/")) {
    return evaluateScopedWriteRoute(
      apiKey,
      authResult,
      isDevBypass,
      "webhooks:manage",
      "webhook management",
    );
  }

  if (
    (pathname === "/api/quests" || pathname.startsWith("/api/quests/")) &&
    !pathname.includes("/apply")
  ) {
    return evaluateScopedWriteRoute(
      apiKey,
      authResult,
      isDevBypass,
      "quests:manage",
      "quest management",
    );
  }

  return null;
}

function evaluateClosedByDefault(
  pathname: string,
  method: string,
  apiKey: string | null,
  authResult: VerificationResult,
  isDevBypass: boolean,
): AuthEvaluationResult | null {
  const isPublic = isPublicPage(pathname) || isPublicApiRoute(pathname, method);
  if (isPublic || isDevBypass) return null;

  if (!apiKey) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: API key required",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  if (!authResult.valid) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Invalid or revoked API key",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  return null;
}

/**
 * Core Auth and Rate Limiting Evaluator
 */
export async function evaluateAuth(
  req: Request | NextRequest,
): Promise<AuthEvaluationResult> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  const apiKey = extractApiKey(req);
  const authResult = apiKey
    ? await verifyApiKey(apiKey)
    : {
        valid: false,
        tier: "no_key" as ApiKeyTier,
        scopes: [] as string[],
        isAdmin: false,
      };

  const clientIp = getClientIp(req);
  // Check bypass modes (DEV_MODE) — strictly never honored in production
  const isDevBypass =
    process.env.NODE_ENV !== "production" && process.env.DEV_MODE === "true";

  // Rate Limiting Evaluation
  const rateLimitEval = evaluateRateLimit(authResult, clientIp);
  if (!rateLimitEval.allowed) {
    return {
      allowed: false,
      status: rateLimitEval.status,
      error: rateLimitEval.error,
      tier: authResult.tier,
      scopes: authResult.scopes,
      isAdmin: authResult.isAdmin,
      headers: rateLimitEval.headers,
    };
  }

  // Admin Routes (Highest protection)
  const isAdminRoute =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/");

  if (isAdminRoute) {
    const adminCheck = evaluateAdminRoute(apiKey, authResult, isDevBypass);
    return {
      ...adminCheck,
      headers: {
        ...rateLimitEval.headers,
        ...(adminCheck.headers || {}),
      },
    };
  }

  const writeCheck = evaluateStateMutatingRoutes(
    pathname,
    method,
    apiKey,
    authResult,
    isDevBypass,
  );
  if (writeCheck) {
    return {
      ...writeCheck,
      headers: {
        ...rateLimitEval.headers,
        ...(writeCheck.headers || {}),
      },
    };
  }

  const closedByDefaultCheck = evaluateClosedByDefault(
    pathname,
    method,
    apiKey,
    authResult,
    isDevBypass,
  );
  if (closedByDefaultCheck) {
    return {
      ...closedByDefaultCheck,
      headers: {
        ...rateLimitEval.headers,
        ...(closedByDefaultCheck.headers || {}),
      },
    };
  }

  return {
    allowed: true,
    status: 200,
    tier: authResult.tier,
    scopes: authResult.scopes,
    isAdmin: authResult.isAdmin,
    headers: rateLimitEval.headers,
  };
}

/**
 * Standard Next.js middleware handler for auth & rate limiting.
 */
export async function authMiddleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  if (isStaticOrInternalPath(pathname)) {
    return NextResponse.next();
  }

  const result = await evaluateAuth(req);

  if (!result.allowed) {
    return NextResponse.json(
      { ok: false, error: result.error || "Unauthorized" },
      {
        status: result.status,
        headers: result.headers,
      },
    );
  }

  const response = NextResponse.next();

  if (result.headers) {
    for (const [key, val] of Object.entries(result.headers)) {
      response.headers.set(key, val);
    }
  }

  return response;
}
